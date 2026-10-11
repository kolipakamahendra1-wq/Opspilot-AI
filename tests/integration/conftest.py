"""Integration tests run against the real Postgres + mock service, with the rule-based agent."""
import os
import socket
import threading
import time

os.environ.setdefault("LLM_PROVIDER", "rules")

import httpx  # noqa: E402
import pytest  # noqa: E402
import uvicorn  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.config import get_settings  # noqa: E402


def _port_open(host: str, port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex((host, port)) == 0


@pytest.fixture(scope="session", autouse=True)
def mock_service():
    url = httpx.URL(get_settings().mock_service_url)
    if not _port_open(url.host, url.port):
        from mock_service.main import app

        server = uvicorn.Server(uvicorn.Config(app, host=url.host, port=url.port, log_level="warning"))
        threading.Thread(target=server.run, daemon=True).start()
        for _ in range(50):
            if _port_open(url.host, url.port):
                break
            time.sleep(0.1)
    yield


@pytest.fixture(scope="session")
def client():
    from backend.database.seed import main as seed_main
    from backend.main import app

    seed_main()
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def fresh_demo_data():
    from backend.database.seed import reset_demo_data

    reset_demo_data()
    yield


def _login(client, email, password) -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def admin(client):
    st = get_settings()
    return _login(client, "admin@demo.com", st.admin_password)


@pytest.fixture(scope="session")
def support(client):
    st = get_settings()
    return _login(client, "support@demo.com", st.support_password)
