import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import deps
from app.core.config import get_settings
from app.integrations.upstox import UpstoxClient
from app.main import app
from app.models.broker_connection import BrokerConnection

REDIRECT = "https://stock-market-trading-api-5flm.onrender.com/api/v1/auth/upstox/callback"
SECRET = "test-client-secret"
ACCESS_TOKEN = "test-access-token-value"


@pytest.fixture
def enc_key() -> str:
    return Fernet.generate_key().decode()


@pytest.fixture(autouse=True)
def upstox_env(monkeypatch, enc_key):
    """Deterministic settings that ignore any real backend/.env values."""
    for name, value in {
        "DATABASE_URL": "",
        "UPSTOX_CLIENT_ID": "test-client-id",
        "UPSTOX_CLIENT_SECRET": SECRET,
        "UPSTOX_REDIRECT_URI": REDIRECT,
        "UPSTOX_TOKEN_ENCRYPTION_KEY": enc_key,
        "UPSTOX_ALLOWED_USER_ID": "",
        "FRONTEND_URL": "https://frontend.example",
        "APP_ENV": "test",
    }.items():
        monkeypatch.setenv(name, value)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
    app.dependency_overrides.clear()


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    BrokerConnection.__table__.create(engine)
    with sessionmaker(bind=engine, expire_on_commit=False)() as session:
        yield session


@pytest.fixture
def make_client(db_session):
    """Build a TestClient whose Upstox HTTP calls are answered by `handler`."""

    def _make(handler) -> TestClient:
        transport = httpx.MockTransport(handler)
        app.dependency_overrides[deps.get_db_or_503] = lambda: db_session
        app.dependency_overrides[deps.get_upstox_client] = lambda: UpstoxClient(
            get_settings(), transport=transport
        )
        return TestClient(app, follow_redirects=False)

    return _make
