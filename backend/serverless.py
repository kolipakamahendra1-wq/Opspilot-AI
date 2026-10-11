"""Cold-start bootstrap for serverless hosting (Vercel).

Each new function instance seeds missing data once. A Postgres advisory lock keeps
instances that start at the same time from seeding concurrently.
"""
from sqlalchemy import text

from backend.database.session import engine

_SEED_LOCK = 742_001
_ready = False


def bootstrap() -> None:
    global _ready
    if _ready:
        return
    from backend.database.seed import main as seed

    with engine.connect() as conn:
        conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": _SEED_LOCK})
        try:
            seed()  # idempotent: tables, role, users, records, tickets, knowledge base
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _SEED_LOCK})
            conn.commit()
    _ready = True
