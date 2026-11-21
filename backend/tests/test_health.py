import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def no_database(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_health_ok():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["trading_mode"] == "paper"


def test_health_db_reports_not_configured():
    r = client.get("/api/v1/health/db")
    assert r.status_code == 503
    assert r.json()["status"] == "not_configured"
