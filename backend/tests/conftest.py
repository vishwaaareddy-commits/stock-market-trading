from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
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
from app.models.enums import UserRole


@compiles(JSONB, "sqlite")  # lets the full schema be created on SQLite for tests
def _jsonb_sqlite(type_, compiler, **kw):
    return "JSON"


# NOTE: SQLite stores Numeric as float internally (warning filtered in pytest.ini);
# production uses PostgreSQL NUMERIC. Money maths itself is done with Decimal.

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
        # Upstox endpoints now require a signed-in Super Admin; auth itself is covered elsewhere.
        stub = SimpleNamespace(id=1, username="test-admin", role=UserRole.SUPER_ADMIN, must_change_password=False)
        app.dependency_overrides[deps.get_current_user] = lambda: stub
        app.dependency_overrides[deps.require_super_admin] = lambda: stub
        app.dependency_overrides[deps.get_upstox_client] = lambda: UpstoxClient(
            get_settings(), transport=transport
        )
        return TestClient(app, follow_redirects=False)

    return _make


# ======================================================================================
# Full-schema fixtures for auth / admin / wallet / paper-trading tests
# ======================================================================================
import os  # noqa: E402
from decimal import Decimal  # noqa: E402

from sqlalchemy.orm import Session  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.models.enums import UserRole  # noqa: E402,F811
from app.models.instrument import Instrument  # noqa: E402
from app.models.user import User  # noqa: E402
from app import models as _models  # noqa: E402,F401  (registers every table)
from app.core.passwords import hash_password  # noqa: E402
from app.services import wallet as wallet_service  # noqa: E402

STRONG_PW = "Correct-Horse-9-Battery"
OTHER_PW = "Another-Strong-Pass-42"


def build_engine(sqlite_path: str | None = None):
    """In-memory SQLite by default. Set TEST_DATABASE_URL (a LOCAL throwaway PostgreSQL) to run
    the same tests against real PostgreSQL: row locks, NUMERIC and CHECK constraints included."""
    pg = os.environ.get("TEST_DATABASE_URL")
    if pg:
        eng = create_engine(pg, pool_size=10)
        Base.metadata.drop_all(eng)
        Base.metadata.create_all(eng)
        return eng
    if sqlite_path:
        eng = create_engine(f"sqlite:///{sqlite_path}", connect_args={"check_same_thread": False, "timeout": 60})
    else:
        eng = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(eng)
    return eng


@pytest.fixture
def engine():
    eng = build_engine()
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine):
    with Session(engine, expire_on_commit=False) as session:
        yield session


@pytest.fixture
def factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=False)


@pytest.fixture
def client(factory):
    """Real auth flow against an in-memory DB; a fresh session per request like production."""

    def override():
        with factory() as session:
            yield session

    app.dependency_overrides[deps.get_db_or_503] = override
    return TestClient(app, follow_redirects=False)


def new_client() -> TestClient:
    return TestClient(app, follow_redirects=False)


def make_user(db, username, role=UserRole.ADMIN, password=STRONG_PW, balance="0", active=True, must_change=False):
    user = User(
        username=username, email=f"{username}@example.com", display_name=username.title(),
        hashed_password=hash_password(password), role=role, is_active=active, must_change_password=must_change,
    )
    db.add(user)
    db.flush()
    wallet_service.ensure_wallet(db, user.id)
    if Decimal(balance) > 0:
        actor = user if role == UserRole.SUPER_ADMIN else db.query(User).filter_by(role=UserRole.SUPER_ADMIN).first() or user
        wallet_service.credit_initial(db, user, Decimal(balance), actor)
    db.commit()
    return user


def login(client, username, password=STRONG_PW):
    return client.post("/api/v1/auth/login", json={"identifier": username, "password": password})


@pytest.fixture
def superadmin(db):
    return make_user(db, "root", UserRole.SUPER_ADMIN, balance="500000")


@pytest.fixture
def sa_client(client, superadmin):
    assert login(client, "root").status_code == 200
    return client


@pytest.fixture
def instrument(db):
    inst = Instrument(symbol="TESTCO", exchange="NSE", name="Test Co", instrument_type="EQ", is_active=True)
    db.add(inst)
    db.commit()
    return inst


def order_body(instrument_id, side="BUY", qty=10, price="100.00"):
    return {"instrument_id": instrument_id, "side": side, "quantity": qty, "limit_price": price}


def place(c, instrument_id, key, side="BUY", qty=10, price="100.00"):
    return c.post("/api/v1/paper/orders", json=order_body(instrument_id, side, qty, price),
                  headers={"Idempotency-Key": key})
