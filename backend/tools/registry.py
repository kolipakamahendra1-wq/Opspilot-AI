"""The agent's tools (FR-4): Pydantic-validated inputs/outputs, read vs. action tagging."""
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx
from pydantic import BaseModel, Field
from sqlalchemy import text

from backend.config import get_settings
from backend.database.models import Ticket
from backend.database.session import readonly_engine, session_scope
from backend.rag.retrieve import search
from backend.tools.sql_guard import validate_select


class ToolUnavailable(Exception):
    """Transient failure (timeout / 5xx): eligible for retry and fallback."""


class ToolFailed(Exception):
    """Permanent failure (4xx, validation): do not retry."""


# ---------- input schemas ----------

class SearchKnowledgeIn(BaseModel):
    query: str = Field(min_length=2, max_length=500)


class QueryOrdersDbIn(BaseModel):
    sql: str = Field(min_length=6, max_length=2000)


class OrderIdIn(BaseModel):
    order_id: str = Field(pattern=r"^ORD-\d{4,6}$")


class PaymentIdIn(BaseModel):
    payment_id: str = Field(pattern=r"^PAY-\d{4,6}$")


class TxnIdIn(BaseModel):
    txn_id: str = Field(pattern=r"^TXN-\d{4,6}$")


class EscalateIn(BaseModel):
    ticket_id: str = Field(pattern=r"^TICKET-\d{1,8}$")
    reason: str = Field(min_length=5, max_length=1000)


# ---------- output schemas ----------

class KnowledgeHit(BaseModel):
    source: str
    text: str
    score: float


class SearchKnowledgeOut(BaseModel):
    results: list[KnowledgeHit]


class QueryOut(BaseModel):
    sql: str
    rows: list[dict[str, Any]]
    row_count: int


class OrderOut(BaseModel):
    order_id: str
    customer_id: str
    status: str
    amount: float
    shipping_status: str | None = None
    carrier: str | None = None
    eta_days: int | None = None
    created_at: str
    payment_ids: list[str] = []


class PaymentOut(BaseModel):
    payment_id: str
    order_id: str
    txn_id: str
    status: str
    amount: float
    card_last4: str


class WebhookOut(BaseModel):
    txn_id: str
    event: str
    status: str
    attempts: int
    last_error: str | None = None
    order_id: str | None = None


class ReplayOut(BaseModel):
    txn_id: str
    replayed: bool
    detail: str
    order_status: str


class EscalateOut(BaseModel):
    ticket_id: str
    escalated: bool
    ticket_status: str


# ---------- implementations ----------

def _mock(method: str, path: str) -> dict:
    st = get_settings()
    try:
        r = httpx.request(method, f"{st.mock_service_url}{path}", timeout=st.tool_timeout_s)
    except httpx.HTTPError as e:
        raise ToolUnavailable(f"{type(e).__name__}: {e}")
    if r.status_code >= 500:
        raise ToolUnavailable(f"HTTP {r.status_code}: {r.text[:200]}")
    if r.status_code >= 400:
        raise ToolFailed(f"HTTP {r.status_code}: {r.json().get('detail', r.text[:200])}")
    return r.json()


def search_knowledge(a: SearchKnowledgeIn) -> SearchKnowledgeOut:
    return SearchKnowledgeOut(results=[KnowledgeHit(**c.model_dump()) for c in search(a.query, k=5)])


def query_orders_db(a: QueryOrdersDbIn) -> QueryOut:
    safe = validate_select(a.sql)  # raises SQLRejected (a ValueError) -> ToolFailed upstream
    with readonly_engine.connect() as conn:
        conn.execute(text("SET TRANSACTION READ ONLY"))
        conn.execute(text("SET LOCAL statement_timeout = '3s'"))
        rows = [dict(r._mapping) for r in conn.execute(text(safe))]
    rows = [{k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in r.items()} for r in rows]
    return QueryOut(sql=safe, rows=rows, row_count=len(rows))


def get_order(a: OrderIdIn) -> OrderOut:
    return OrderOut(**_mock("GET", f"/orders/{a.order_id}"))


def get_payment(a: PaymentIdIn) -> PaymentOut:
    return PaymentOut(**_mock("GET", f"/payments/{a.payment_id}"))


def get_webhook_status(a: TxnIdIn) -> WebhookOut:
    return WebhookOut(**_mock("GET", f"/webhooks/{a.txn_id}"))


def replay_webhook(a: TxnIdIn) -> ReplayOut:
    return ReplayOut(**_mock("POST", f"/webhooks/{a.txn_id}/replay"))


def escalate_ticket(a: EscalateIn) -> EscalateOut:
    with session_scope() as s:
        t = s.get(Ticket, a.ticket_id)
        if not t:
            raise ToolFailed("ticket not found")
        t.status = "escalated"
        return EscalateOut(ticket_id=t.id, escalated=True, ticket_status=t.status)


@dataclass(frozen=True)
class Tool:
    name: str
    fn: Callable
    input_model: type[BaseModel]
    kind: str  # read | action
    description: str

    @property
    def needs_approval(self) -> bool:
        return self.kind == "action"


TOOLS: dict[str, Tool] = {t.name: t for t in [
    Tool("search_knowledge", search_knowledge, SearchKnowledgeIn, "read", "Semantic search over runbooks and docs"),
    Tool("query_orders_db", query_orders_db, QueryOrdersDbIn, "read", "Read-only SELECT over customers/orders/payments/webhook_events"),
    Tool("get_order", get_order, OrderIdIn, "read", "Order details from the order API"),
    Tool("get_payment", get_payment, PaymentIdIn, "read", "Payment details from the payment API"),
    Tool("get_webhook_status", get_webhook_status, TxnIdIn, "read", "Webhook delivery status for a transaction"),
    Tool("replay_webhook", replay_webhook, TxnIdIn, "action", "Re-deliver a failed payment webhook"),
    Tool("escalate_ticket", escalate_ticket, EscalateIn, "action", "Escalate the ticket to a human team"),
]}

# FR-7: alternative data sources when a tool keeps failing.
ALTERNATIVES: dict[str, Callable[[dict], tuple[str, dict]]] = {
    "get_webhook_status": lambda args: (
        "query_orders_db",
        {"sql": "SELECT txn_id, event, status, attempts, last_error FROM webhook_events "
                f"WHERE txn_id = '{TxnIdIn(**args).txn_id}' ORDER BY id DESC LIMIT 1"},
    ),
}
