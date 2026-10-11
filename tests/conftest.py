"""Point every test at a separate database and mock-service port so dev data is never touched.

Runs before any test module imports `backend`, because settings and engines are created at import.
"""
import os

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

TEST_DB = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://opspilot:opspilot@127.0.0.1:5434/opspilot_test")
_url = make_url(TEST_DB)

os.environ["DATABASE_URL"] = TEST_DB
os.environ["READONLY_DATABASE_URL"] = _url.set(username="opspilot_ro", password="opspilot_ro").render_as_string(hide_password=False)
os.environ["MOCK_SERVICE_URL"] = os.environ.get("TEST_MOCK_SERVICE_URL", "http://127.0.0.1:8011")
os.environ.setdefault("LLM_PROVIDER", "rules")


def _ensure_database() -> None:
    admin = create_engine(_url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        if not conn.execute(text("SELECT 1 FROM pg_database WHERE datname = :d"), {"d": _url.database}).scalar():
            conn.execute(text(f'CREATE DATABASE "{_url.database}"'))
    admin.dispose()
    db = create_engine(_url, isolation_level="AUTOCOMMIT")
    with db.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.execute(text(f'GRANT CONNECT ON DATABASE "{_url.database}" TO opspilot_ro'))
    db.dispose()


try:
    _ensure_database()
except Exception as e:  # unit tests do not need a database
    print(f"[tests] database setup skipped: {e}")
