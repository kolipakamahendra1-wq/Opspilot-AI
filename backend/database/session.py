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
        if not conn.execute(text("SELECT 1 FROM pg_extension WHERE extname='vector'")).scalar():
            conn.execute(text("CREATE EXTENSION vector"))
    Base.metadata.create_all(engine)
    _ensure_readonly_role()


def _ensure_readonly_role() -> None:
    """Create the read-only role if missing (hosted Postgres runs no init scripts).

    It may only SELECT the demo tables, never users/audit/etc. (FR-5)
    """
    pw = _settings.readonly_db_password.replace("'", "''")
    with engine.begin() as conn:
        if not conn.execute(text("SELECT 1 FROM pg_roles WHERE rolname='opspilot_ro'")).scalar():
            conn.exec_driver_sql(f"CREATE ROLE opspilot_ro LOGIN PASSWORD '{pw}'")
            conn.exec_driver_sql("ALTER ROLE opspilot_ro SET statement_timeout = '3s'")
            conn.exec_driver_sql("ALTER ROLE opspilot_ro SET default_transaction_read_only = on")
            db = conn.execute(text("SELECT current_database()")).scalar()
            conn.exec_driver_sql(f'GRANT CONNECT ON DATABASE "{db}" TO opspilot_ro')
            conn.exec_driver_sql("GRANT USAGE ON SCHEMA public TO opspilot_ro")
        for t in DEMO_TABLES:
            conn.exec_driver_sql(f"GRANT SELECT ON {t} TO opspilot_ro")
