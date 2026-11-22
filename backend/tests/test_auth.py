from datetime import timedelta

import pytest
from sqlalchemy import select

from app import cli
from app.core.config import get_settings
from app.core.passwords import generate_temp_password, hash_password, validate_password, PasswordPolicyError, verify_password
from app.models.audit_log import AuditLog
from app.models.auth_session import AuthSession
from app.models.enums import UserRole
from app.models.user import User
from app.services import auth as auth_service
from tests.conftest import OTHER_PW, STRONG_PW, login, make_user, new_client


# --- bootstrap ------------------------------------------------------------------------
def test_bootstrap_creates_one_super_admin_with_wallet(db, monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_SUPERADMIN_USERNAME", "Boss")
    monkeypatch.setenv("BOOTSTRAP_SUPERADMIN_EMAIL", "boss@example.com")
    monkeypatch.setenv("BOOTSTRAP_SUPERADMIN_PASSWORD", STRONG_PW)
    get_settings.cache_clear()
    msg = cli.bootstrap_superadmin(db, get_settings())
    assert "created" in msg
    user = db.scalar(select(User).where(User.username == "boss"))
    assert user.role == UserRole.SUPER_ADMIN and user.hashed_password.startswith("$argon2id$")
    # Second run is a no-op: it cannot be used to add or promote accounts.
    assert "already exists" in cli.bootstrap_superadmin(db, get_settings())
    assert db.query(User).count() == 1


def test_bootstrap_requires_env_and_strong_password(db, monkeypatch):
    for name in ("USERNAME", "EMAIL", "PASSWORD"):
        monkeypatch.setenv(f"BOOTSTRAP_SUPERADMIN_{name}", "")
    get_settings.cache_clear()
    with pytest.raises(ValueError, match="Set BOOTSTRAP_SUPERADMIN"):
        cli.bootstrap_superadmin(db, get_settings())
    monkeypatch.setenv("BOOTSTRAP_SUPERADMIN_USERNAME", "boss")
    monkeypatch.setenv("BOOTSTRAP_SUPERADMIN_EMAIL", "boss@example.com")
    monkeypatch.setenv("BOOTSTRAP_SUPERADMIN_PASSWORD", "short")
    get_settings.cache_clear()
    with pytest.raises(ValueError):
        cli.bootstrap_superadmin(db, get_settings())
    assert db.query(User).count() == 0


# --- password hashing / policy --------------------------------------------------------
def test_passwords_are_argon2id_hashed_never_plaintext(db):
    user = make_user(db, "alice")
    assert user.hashed_password.startswith("$argon2id$")
    assert STRONG_PW not in user.hashed_password
    assert verify_password(STRONG_PW, user.hashed_password)
    assert not verify_password("wrong", user.hashed_password)
    assert not verify_password("anything", None)  # unknown user path


def test_password_policy_and_generator():
    with pytest.raises(PasswordPolicyError):
        validate_password("short1A!", min_length=12)
    with pytest.raises(PasswordPolicyError):
        validate_password("alllowercaseletters", min_length=12)
    with pytest.raises(PasswordPolicyError):
        validate_password("Contains-alice-Name1", min_length=12, forbidden=["alice"])
    validate_password(STRONG_PW, min_length=12)
    for _ in range(20):
        validate_password(generate_temp_password(), min_length=12)


# --- login / logout -------------------------------------------------------------------
def test_login_success_sets_httponly_cookie_and_hides_secrets(client, db):
    make_user(db, "alice")
    r = login(client, "Alice")  # case-insensitive username
    assert r.status_code == 200
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    body = r.text.lower()
    assert "hash" not in body and "argon2" not in body and "password" not in body.replace("must_change_password", "")
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200 and me.json()["username"] == "alice"
    assert "hashed_password" not in me.json()


def test_login_by_email_works(client, db):
    make_user(db, "alice")
    assert login(client, "alice@example.com").status_code == 200


def test_login_failures_are_uniform(client, db):
    make_user(db, "alice")
    make_user(db, "inactive", active=False)
    bad_pw = login(client, "alice", "Wrong-Password-1!")
    unknown = login(client, "nobody", STRONG_PW)
    inactive = login(client, "inactive")
    assert {bad_pw.status_code, unknown.status_code, inactive.status_code} == {401}
    assert bad_pw.json() == unknown.json() == inactive.json()  # no user enumeration
    assert "set-cookie" not in bad_pw.headers


def test_bruteforce_lockout_and_audit(client, db):
    make_user(db, "alice")
    for _ in range(5):
        assert login(client, "alice", "Wrong-Password-1!").status_code == 401
    locked = login(client, "alice", "Wrong-Password-1!")
    assert locked.status_code == 429 and int(locked.headers["Retry-After"]) > 0
    # even the right password is refused while locked
    assert login(client, "alice").status_code == 429
    assert db.query(AuditLog).filter_by(action="LOGIN_FAILURE").count() == 5


def test_throttle_expires_after_window_and_success_resets_counter(db):
    make_user(db, "alice")
    s = get_settings()
    t0 = auth_service.utcnow()
    for i in range(5):
        with pytest.raises(auth_service.InvalidCredentials):
            auth_service.login(db, s, "alice", "bad-Password-1!", ip="1.1.1.1", user_agent=None, now=t0)
    with pytest.raises(auth_service.Throttled):
        auth_service.login(db, s, "alice", STRONG_PW, ip="1.1.1.1", user_agent=None, now=t0 + timedelta(minutes=1))
    later = t0 + timedelta(minutes=s.login_window_minutes + 1)
    assert auth_service.login(db, s, "alice", STRONG_PW, ip="1.1.1.1", user_agent=None, now=later).user.username == "alice"
    # success resets: 4 more failures are still allowed
    for _ in range(4):
        with pytest.raises(auth_service.InvalidCredentials):
            auth_service.login(db, s, "alice", "bad-Password-1!", ip="1.1.1.1", user_agent=None, now=later)


def test_logout_revokes_session(client, db):
    make_user(db, "alice")
    login(client, "alice")
    token = client.cookies.get("session")
    assert client.post("/api/v1/auth/logout").status_code == 204
    replay = new_client()
    replay.cookies.set("session", token)
    assert replay.get("/api/v1/auth/me").status_code == 401
    actions = [a.action for a in db.query(AuditLog).order_by(AuditLog.id)]
    assert {"LOGIN_SUCCESS", "SESSION_CREATED", "LOGOUT"} <= set(actions)


def test_session_tokens_are_stored_hashed(client, db):
    make_user(db, "alice")
    login(client, "alice")
    token = client.cookies.get("session")
    row = db.scalar(select(AuthSession))
    assert token not in row.token_hash and len(row.token_hash) == 64


# --- expiry / revocation --------------------------------------------------------------
def test_session_absolute_and_idle_expiry(db):
    make_user(db, "alice")
    s = get_settings()
    t0 = auth_service.utcnow()
    res = auth_service.login(db, s, "alice", STRONG_PW, ip=None, user_agent=None, now=t0)
    # idle: no activity for longer than the idle timeout (checked on an untouched session)
    assert auth_service.resolve_session(db, s, res.token, now=t0 + timedelta(minutes=s.session_idle_minutes + 1)) is None
    fresh = auth_service.login(db, s, "alice", STRONG_PW, ip=None, user_agent=None, now=t0)
    assert auth_service.resolve_session(db, s, fresh.token, now=t0 + timedelta(minutes=5))
    res2 = auth_service.login(db, s, "alice", STRONG_PW, ip=None, user_agent=None, now=t0)
    # absolute: keep it "active" yet exceed the hard limit
    step = timedelta(minutes=s.session_idle_minutes - 5)
    now = t0
    while now < t0 + timedelta(hours=s.session_absolute_hours):
        now += step
        if now < t0 + timedelta(hours=s.session_absolute_hours):
            assert auth_service.resolve_session(db, s, res2.token, now=now)
    assert auth_service.resolve_session(db, s, res2.token, now=t0 + timedelta(hours=s.session_absolute_hours, seconds=1)) is None


def test_password_change_revokes_other_sessions_only(client, db):
    make_user(db, "alice")
    login(client, "alice")
    other = new_client()
    login(other, "alice")
    r = client.post("/api/v1/auth/change-password", json={"current_password": STRONG_PW, "new_password": OTHER_PW})
    assert r.status_code == 204
    assert other.get("/api/v1/auth/me").status_code == 401  # revoked
    assert client.get("/api/v1/auth/me").status_code == 200  # current continues
    assert login(new_client(), "alice", STRONG_PW).status_code == 401
    assert login(new_client(), "alice", OTHER_PW).status_code == 200


def test_change_password_validation(client, db):
    make_user(db, "alice")
    login(client, "alice")
    assert client.post("/api/v1/auth/change-password",
                       json={"current_password": "nope-Nope-1!", "new_password": OTHER_PW}).status_code == 400
    assert client.post("/api/v1/auth/change-password",
                       json={"current_password": STRONG_PW, "new_password": "weak"}).status_code == 400
    assert client.post("/api/v1/auth/change-password",
                       json={"current_password": STRONG_PW, "new_password": STRONG_PW}).status_code == 400


def test_forced_password_change_blocks_other_endpoints(client, db):
    make_user(db, "temp", must_change=True)
    login(client, "temp")
    assert client.get("/api/v1/auth/me").json()["must_change_password"] is True
    blocked = client.get("/api/v1/wallet")
    assert blocked.status_code == 403 and blocked.json()["detail"] == "password_change_required"
    assert client.post("/api/v1/auth/heartbeat").status_code == 200  # presence still works
    client.post("/api/v1/auth/change-password", json={"current_password": STRONG_PW, "new_password": OTHER_PW})
    assert client.get("/api/v1/wallet").status_code == 200


# --- misc hardening -------------------------------------------------------------------
def test_no_public_registration(client):
    for path in ("/api/v1/auth/register", "/api/v1/auth/signup", "/api/v1/users"):
        assert client.post(path, json={"username": "x", "password": STRONG_PW}).status_code in (404, 405)


@pytest.mark.parametrize("method,path", [
    ("get", "/api/v1/auth/me"), ("get", "/api/v1/wallet"), ("get", "/api/v1/wallet/transactions"),
    ("get", "/api/v1/paper/orders"), ("get", "/api/v1/paper/trades"), ("get", "/api/v1/paper/positions"),
    ("get", "/api/v1/paper/performance"), ("post", "/api/v1/auth/heartbeat"),
    ("get", "/api/v1/admin/dashboard"), ("get", "/api/v1/admin/users"), ("get", "/api/v1/admin/audit-logs"),
    ("get", "/api/v1/auth/upstox/status"), ("get", "/api/v1/market-data/upstox/test"),
])
def test_endpoints_require_authentication(client, path, method):
    assert getattr(client, method)(path).status_code == 401


def test_cross_origin_state_change_is_blocked(client, db):
    make_user(db, "alice")
    r = client.post("/api/v1/auth/login", json={"identifier": "alice", "password": STRONG_PW},
                    headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    ok = client.post("/api/v1/auth/login", json={"identifier": "alice", "password": STRONG_PW},
                     headers={"Origin": "https://frontend.example"})
    assert ok.status_code == 200


def test_deactivated_account_session_stops_working(client, db):
    user = make_user(db, "alice")
    login(client, "alice")
    user.is_active = False
    db.commit()
    assert client.get("/api/v1/auth/me").status_code == 401
