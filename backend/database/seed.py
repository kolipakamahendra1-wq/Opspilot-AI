"""Idempotent seed: demo users, ~340 internal-system records, sample tickets, knowledge base.

Run: python -m backend.database.seed
"""
import random
from datetime import timedelta

from sqlalchemy import delete, func, select

from backend.config import get_settings
from backend.database.models import (
    Customer, Order, Payment, Ticket, User, WebhookEvent, utcnow,
)
from backend.database.scenarios import customer_scenarios
from backend.database.session import init_db, session_scope
from backend.security.auth import hash_password

FIRST = ["Aarav", "Priya", "Liam", "Emma", "Noah", "Ava", "Ravi", "Sofia", "Kenji", "Mia", "Omar", "Lena", "Arjun", "Chloe", "Diego"]
LAST = ["Sharma", "Patel", "Smith", "Garcia", "Kim", "Nguyen", "Reddy", "Brown", "Rossi", "Khan", "Silva", "Müller"]
CARRIERS = ["BlueDart", "DHL", "FedEx", "UPS"]

SAMPLE_TICKETS = [
    ("CUST-1001", "My payment succeeded but my order is still pending.", "high", "checkout"),
    ("CUST-1009", "My card payment did not go through and the order is stuck.", "medium", "checkout"),
    ("CUST-1013", "I was charged twice for the same order!", "high", "billing"),
    ("CUST-1017", "I cancelled my order last week, where is my refund?", "medium", "billing"),
    ("CUST-1027", "My order has been processing for days and hasn't shipped.", "medium", "orders"),
    ("CUST-1036", "My package is late, the tracking hasn't moved.", "low", "shipping"),
    ("CUST-1047", "I can't log in, it says my account is locked.", "high", "account"),
    ("CUST-1051", "I can't sign in to my account after registering.", "low", "account"),
    ("CUST-1055", "Paid successfully but order still shows pending.", "high", "checkout"),
    ("CUST-1021", "Where is my order? Just checking the status.", "low", "orders"),
]


def seed_users(s) -> None:
    st = get_settings()
    for email, name, role, pw in [
        ("admin@demo.com", "Avery Admin", "admin", st.admin_password),
        ("support@demo.com", "Sam Support", "support", st.support_password),
    ]:
        if not s.scalar(select(User).where(User.email == email)):
            s.add(User(email=email, name=name, role=role, password_hash=hash_password(pw)))


def seed_systems(s) -> None:
    if s.scalar(select(func.count()).select_from(Customer)):
        return
    rng = random.Random(42)
    now = utcnow()
    counters = {"order": 5001, "pay": 7001, "txn": 9001}

    def next_id(kind: str, prefix: str) -> str:
        v = counters[kind]
        counters[kind] += 1
        return f"{prefix}-{v}"

    def add_order(cust: str, status: str, age_h: float, **kw) -> Order:
        o = Order(id=next_id("order", "ORD"), customer_id=cust, status=status,
                  amount=round(rng.uniform(15, 400), 2),
                  created_at=now - timedelta(hours=age_h), updated_at=now - timedelta(hours=age_h), **kw)
        s.add(o)
        return o

    def add_payment(o: Order, status: str, webhook: str | None = "DELIVERED", error: str | None = None) -> Payment:
        p = Payment(id=next_id("pay", "PAY"), order_id=o.id, txn_id=next_id("txn", "TXN"), status=status,
                    amount=o.amount, card_last4=f"{rng.randint(0, 9999):04d}", created_at=o.created_at)
        s.add(p)
        if webhook:
            event = "payment.succeeded" if status == "SUCCESS" else f"payment.{status.lower()}"
            s.add(WebhookEvent(txn_id=p.txn_id, event=event, status=webhook,
                               attempts=3 if webhook == "FAILED" else 1, last_error=error, created_at=o.created_at))
        return p

    for i, (cust, scenario) in enumerate(customer_scenarios().items()):
        name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
        account = {"account_locked": "LOCKED", "email_unverified": "UNVERIFIED"}.get(scenario, "ACTIVE")
        s.add(Customer(id=cust, name=name, email=f"{name.split()[0].lower()}.{cust.lower()}@example.com",
                       phone=f"+1-555-{rng.randint(100, 999)}-{rng.randint(1000, 9999)}",
                       account_status=account, failed_logins=6 if account == "LOCKED" else 0,
                       created_at=now - timedelta(days=200 - i)))
        s.flush()
        # History: an older delivered order for most customers.
        if i % 3 != 2:
            old = add_order(cust, "DELIVERED", rng.uniform(400, 2000), shipping_status="DELIVERED",
                            carrier=rng.choice(CARRIERS), eta_days=0)
            add_payment(old, "SUCCESS")

        carrier = rng.choice(CARRIERS)
        if scenario in ("webhook_failed", "webhook_api_down", "all_api_down"):
            fault = None if scenario == "webhook_failed" else scenario
            o = add_order(cust, "PENDING", rng.uniform(1, 20), fault_mode=fault)
            add_payment(o, "SUCCESS", "FAILED", "HTTP 502 from orders-service after 3 attempts")
        elif scenario == "payment_declined":
            o = add_order(cust, "PENDING", rng.uniform(1, 20))
            add_payment(o, "FAILED", "DELIVERED")
        elif scenario == "duplicate_charge":
            o = add_order(cust, "CONFIRMED", rng.uniform(5, 40))
            add_payment(o, "SUCCESS")
            add_payment(o, "SUCCESS")
        elif scenario == "refund_pending":
            o = add_order(cust, "CANCELLED", rng.uniform(30, 90))
            add_payment(o, "REFUND_PENDING")
        elif scenario == "fulfillment_delay":
            o = add_order(cust, "PROCESSING", rng.uniform(100, 160))
            add_payment(o, "SUCCESS")
        elif scenario == "cancelled_no_refund":
            o = add_order(cust, "CANCELLED", rng.uniform(150, 300))
            add_payment(o, "SUCCESS")
        elif scenario == "carrier_delay":
            o = add_order(cust, "SHIPPED", rng.uniform(150, 250), shipping_status="DELAYED", carrier=carrier, eta_days=-3)
            add_payment(o, "SUCCESS")
        elif scenario == "in_transit":
            o = add_order(cust, "SHIPPED", rng.uniform(24, 60), shipping_status="IN_TRANSIT", carrier=carrier, eta_days=2)
            add_payment(o, "SUCCESS")
        elif scenario == "address_issue":
            o = add_order(cust, "SHIPPED", rng.uniform(60, 120), shipping_status="ADDRESS_ISSUE", carrier=carrier, eta_days=None)
            add_payment(o, "SUCCESS")
        else:  # healthy, account_locked, email_unverified
            o = add_order(cust, "CONFIRMED", rng.uniform(2, 30))
            add_payment(o, "SUCCESS")
        s.flush()


def seed_tickets(s) -> None:
    if s.scalar(select(func.count()).select_from(Ticket)):
        return
    support = s.scalar(select(User).where(User.email == "support@demo.com"))
    for n, (cust, msg, prio, product) in enumerate(SAMPLE_TICKETS, start=1001):
        s.add(Ticket(id=f"TICKET-{n}", customer_id=cust, message=msg, priority=prio, product=product,
                     created_by=support.id if support else None))


def reset_demo_data() -> None:
    """Delete and re-create the deterministic internal-system records."""
    with session_scope() as s:
        for model in (WebhookEvent, Payment, Order, Customer):
            s.execute(delete(model))
    with session_scope() as s:
        seed_systems(s)


def main() -> None:
    from backend.rag.ingest import ingest_directory

    init_db()
    with session_scope() as s:
        seed_users(s)
        seed_systems(s)
    with session_scope() as s:
        seed_tickets(s)
    n = ingest_directory()
    with session_scope() as s:
        counts = {m.__tablename__: s.scalar(select(func.count()).select_from(m))
                  for m in (Customer, Order, Payment, WebhookEvent, Ticket, User)}
    print(f"seed complete: {counts}, documents indexed this run: {n}")


if __name__ == "__main__":
    import sys

    if "--reset" in sys.argv:
        reset_demo_data()
        print("demo data reset")
    else:
        main()
