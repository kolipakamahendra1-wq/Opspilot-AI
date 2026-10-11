"""Mock internal service: order / payment / webhook APIs (the "internal systems").

Orders with `fault_mode` simulate outages so the agent's reliability path (FR-7) is testable:
  webhook_api_down -> the webhook endpoints return 503 (the agent can fall back to SQL)
  all_api_down     -> every endpoint for that order's records returns 503 (no fallback; escalate)
"""
from fastapi import FastAPI, HTTPException
from sqlalchemy import select

from backend.database.models import Order, Payment, WebhookEvent, utcnow
from backend.database.session import session_scope

app = FastAPI(title="OpsPilot mock internal service")


def _order_dict(o: Order) -> dict:
    return {"order_id": o.id, "customer_id": o.customer_id, "status": o.status, "amount": o.amount,
            "shipping_status": o.shipping_status, "carrier": o.carrier, "eta_days": o.eta_days,
            "created_at": o.created_at.isoformat(), "updated_at": o.updated_at.isoformat()}


def _fault_for_order(o: Order | None, scope: str) -> None:
    if o and o.fault_mode == "all_api_down":
        raise HTTPException(503, "upstream unavailable")
    if o and o.fault_mode == "webhook_api_down" and scope == "webhook":
        raise HTTPException(503, "webhook service unavailable")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/orders/{order_id}")
def get_order(order_id: str) -> dict:
    with session_scope() as s:
        o = s.get(Order, order_id)
        if not o:
            raise HTTPException(404, "order not found")
        _fault_for_order(o, "order")
        payment_ids = list(s.scalars(select(Payment.id).where(Payment.order_id == o.id).order_by(Payment.id)))
        return {**_order_dict(o), "payment_ids": payment_ids}


@app.get("/payments/{payment_id}")
def get_payment(payment_id: str) -> dict:
    with session_scope() as s:
        p = s.get(Payment, payment_id)
        if not p:
            raise HTTPException(404, "payment not found")
        _fault_for_order(s.get(Order, p.order_id), "payment")
        return {"payment_id": p.id, "order_id": p.order_id, "txn_id": p.txn_id, "status": p.status,
                "amount": p.amount, "card_last4": p.card_last4, "created_at": p.created_at.isoformat()}


def _latest_event(s, txn_id: str) -> WebhookEvent | None:
    return s.scalar(select(WebhookEvent).where(WebhookEvent.txn_id == txn_id).order_by(WebhookEvent.id.desc()))


@app.get("/webhooks/{txn_id}")
def webhook_status(txn_id: str) -> dict:
    with session_scope() as s:
        p = s.scalar(select(Payment).where(Payment.txn_id == txn_id))
        if not p:
            raise HTTPException(404, "transaction not found")
        _fault_for_order(s.get(Order, p.order_id), "webhook")
        e = _latest_event(s, txn_id)
        if not e:
            raise HTTPException(404, "no webhook events for transaction")
        return {"txn_id": txn_id, "event": e.event, "status": e.status, "attempts": e.attempts,
                "last_error": e.last_error, "order_id": p.order_id}


@app.post("/webhooks/{txn_id}/replay")
def replay_webhook(txn_id: str) -> dict:
    """Replay a failed payment.succeeded webhook: marks it delivered and confirms the PENDING order."""
    with session_scope() as s:
        p = s.scalar(select(Payment).where(Payment.txn_id == txn_id))
        if not p:
            raise HTTPException(404, "transaction not found")
        o = s.get(Order, p.order_id)
        _fault_for_order(o, "webhook")
        e = _latest_event(s, txn_id)
        if not e:
            raise HTTPException(404, "no webhook events for transaction")
        if e.status == "DELIVERED":
            return {"txn_id": txn_id, "replayed": False, "detail": "already delivered", "order_status": o.status}
        e.status, e.attempts, e.last_error = "DELIVERED", e.attempts + 1, None
        if p.status == "SUCCESS" and o.status == "PENDING":
            o.status, o.updated_at = "CONFIRMED", utcnow()
        return {"txn_id": txn_id, "replayed": True, "detail": "webhook delivered", "order_status": o.status}
