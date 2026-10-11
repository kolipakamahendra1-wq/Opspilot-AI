from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from backend.config import get_settings
from backend.database.models import DEMO_TABLES, Base

_settings = get_settings()
engine = create_engine(_settings.database_url, pool_pre_ping=True)
readonly_engine = create_engine(_settings.readonly_database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


@contextmanager
def session_scope() -> Iterator[Session]:
    s = SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


def get_db() -> Iterator[Session]:
    with session_scope() as s:
        yield s


def init_db() -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(engine)
    # The read-only role may only SELECT the demo tables, never users/audit/etc. (FR-5)
    with engine.begin() as conn:
        exists = conn.execute(text("SELECT 1 FROM pg_roles WHERE rolname='opspilot_ro'")).scalar()
        if exists:
            for t in DEMO_TABLES:
                conn.execute(text(f"GRANT SELECT ON {t} TO opspilot_ro"))
