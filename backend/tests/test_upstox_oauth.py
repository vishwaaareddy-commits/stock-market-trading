from urllib.parse import parse_qs, urlparse

import httpx

from app.core.config import get_settings
from app.core.security import TokenCipher
from app.models.broker_connection import BrokerConnection
from app.services import broker_connection as store
from tests.conftest import ACCESS_TOKEN, REDIRECT

TOKEN_OK = {"access_token": ACCESS_TOKEN, "user_id": "U123", "user_name": "Test"}


def _ok_handler(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json=TOKEN_OK)


def _start(client):
    """Run /login and return (state, cookie nonce)."""
    r = client.get("/api/v1/auth/upstox/login")
    assert r.status_code == 302
    params = parse_qs(urlparse(r.headers["location"]).query)
    return params["state"][0], r.cookies.get("upstox_oauth_nonce"), r


def _reason(response) -> dict:
    return parse_qs(urlparse(response.headers["location"]).query)


def test_login_redirects_to_upstox_with_exact_redirect_uri_and_cookie(make_client):
    client = make_client(_ok_handler)
    state, nonce, r = _start(client)
    url = urlparse(r.headers["location"])
    assert url.netloc == "api.upstox.com" and url.path == "/v2/login/authorization/dialog"
    q = parse_qs(url.query)
    assert q["redirect_uri"] == [REDIRECT]
    assert q["client_id"] == ["test-client-id"] and q["response_type"] == ["code"]
    assert "client_secret" not in url.query
    assert nonce
    assert "httponly" in r.headers["set-cookie"].lower()


def test_login_unconfigured_returns_503(monkeypatch, make_client):
    monkeypatch.setenv("UPSTOX_CLIENT_ID", "")
    get_settings.cache_clear()
    client = make_client(_ok_handler)
    assert client.get("/api/v1/auth/upstox/login").status_code == 503


def test_callback_success_stores_encrypted_token(make_client, db_session, enc_key):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = parse_qs(request.content.decode())
        return httpx.Response(200, json=TOKEN_OK)

    client = make_client(handler)
    state, nonce, _ = _start(client)
    r = client.get("/api/v1/auth/upstox/callback", params={"code": "abc", "state": state})

    assert r.status_code == 302
    assert r.headers["location"] == "https://frontend.example/settings?upstox=connected"
    assert seen["url"].endswith("/v2/login/authorization/token")
    assert seen["body"]["code"] == ["abc"]
    assert seen["body"]["grant_type"] == ["authorization_code"]
    assert seen["body"]["redirect_uri"] == [REDIRECT]

    row = db_session.query(BrokerConnection).one()
    assert ACCESS_TOKEN not in row.encrypted_access_token
    assert TokenCipher(enc_key).decrypt(row.encrypted_access_token) == ACCESS_TOKEN
    assert row.provider_user_id == "U123"
    assert row.expires_at is not None


def test_callback_second_login_updates_single_row(make_client, db_session):
    client = make_client(_ok_handler)
    for _ in range(2):
        state, _, _ = _start(client)
        client.get("/api/v1/auth/upstox/callback", params={"code": "abc", "state": state})
    assert db_session.query(BrokerConnection).count() == 1


def test_callback_rejects_missing_or_forged_state(make_client, db_session):
    client = make_client(_ok_handler)
    r = client.get("/api/v1/auth/upstox/callback", params={"code": "abc"})
    assert _reason(r)["reason"] == ["invalid_state"]
    r = client.get("/api/v1/auth/upstox/callback", params={"code": "abc", "state": "a.1.b"})
    assert _reason(r)["reason"] == ["invalid_state"]
    assert db_session.query(BrokerConnection).count() == 0


def test_callback_rejects_state_without_matching_browser_cookie(make_client, db_session):
    """CSRF: a valid state issued to another browser must not be accepted."""
    client = make_client(_ok_handler)
    state, _, _ = _start(client)
    client.cookies.clear()
    r = client.get("/api/v1/auth/upstox/callback", params={"code": "abc", "state": state})
    assert _reason(r)["reason"] == ["invalid_state"]
    assert db_session.query(BrokerConnection).count() == 0


def test_callback_user_denied_and_missing_code(make_client):
    client = make_client(_ok_handler)
    state, _, _ = _start(client)
    r = client.get("/api/v1/auth/upstox/callback", params={"error": "access_denied", "state": state})
    assert _reason(r)["reason"] == ["authorization_denied"]
    state, _, _ = _start(client)
    r = client.get("/api/v1/auth/upstox/callback", params={"state": state})
    assert _reason(r)["reason"] == ["missing_code"]


def test_callback_invalid_credentials(make_client, db_session):
    def handler(request):
        return httpx.Response(
            401, json={"status": "error", "errors": [{"errorCode": "UDAPI100016", "message": "Invalid credentials"}]}
        )

    client = make_client(handler)
    state, _, _ = _start(client)
    r = client.get("/api/v1/auth/upstox/callback", params={"code": "bad", "state": state})
    assert _reason(r)["reason"] == ["invalid_credentials"]
    assert db_session.query(BrokerConnection).count() == 0


def test_callback_provider_errors(make_client):
    for handler in (
        lambda req: httpx.Response(500, text="boom"),
        lambda req: httpx.Response(200, json={"status": "success"}),  # no access_token
        lambda req: httpx.Response(200, text="not json"),
    ):
        client = make_client(handler)
        state, _, _ = _start(client)
        r = client.get("/api/v1/auth/upstox/callback", params={"code": "abc", "state": state})
        assert _reason(r)["reason"] == ["provider_error"]


def test_callback_network_failure(make_client):
    def handler(request):
        raise httpx.ConnectError("down")

    client = make_client(handler)
    state, _, _ = _start(client)
    r = client.get("/api/v1/auth/upstox/callback", params={"code": "abc", "state": state})
    assert _reason(r)["reason"] == ["provider_error"]


def test_callback_rejects_unexpected_user(monkeypatch, make_client, db_session):
    monkeypatch.setenv("UPSTOX_ALLOWED_USER_ID", "SOMEONE_ELSE")
    get_settings.cache_clear()
    client = make_client(_ok_handler)
    state, _, _ = _start(client)
    r = client.get("/api/v1/auth/upstox/callback", params={"code": "abc", "state": state})
    assert _reason(r)["reason"] == ["user_not_allowed"]
    assert db_session.query(BrokerConnection).count() == 0


def test_status_never_exposes_token(make_client, db_session, enc_key):
    client = make_client(_ok_handler)
    r = client.get("/api/v1/auth/upstox/status")
    assert r.json() == {
        "provider": "upstox", "configured": True, "connected": False,
        "expired": False, "expires_at": None, "verified": None,
    }
    state, _, _ = _start(client)
    client.get("/api/v1/auth/upstox/callback", params={"code": "abc", "state": state})
    body = client.get("/api/v1/auth/upstox/status").json()
    assert body["connected"] is True and body["expired"] is False
    assert ACCESS_TOKEN not in str(body)


def test_status_expired_token(make_client, db_session, enc_key):
    from datetime import datetime, timedelta, timezone

    store.save_token(
        db_session, TokenCipher(enc_key), "upstox", ACCESS_TOKEN, "U1",
        datetime.now(timezone.utc) - timedelta(hours=1),
    )
    body = make_client(_ok_handler).get("/api/v1/auth/upstox/status").json()
    assert body["connected"] is False and body["expired"] is True


def test_status_verify_uses_profile_call(monkeypatch, make_client, db_session, enc_key):
    from app.api.routes import upstox_auth
    from app.integrations.upstox import UpstoxClient

    store.save_token(db_session, TokenCipher(enc_key), "upstox", ACCESS_TOKEN, "U1", store.upstox_token_expiry())
    calls = []

    def handler(request):
        calls.append(request.headers["authorization"])
        return httpx.Response(200, json={"status": "success", "data": {"user_id": "U1"}})

    monkeypatch.setattr(
        upstox_auth, "UpstoxClient", lambda s: UpstoxClient(s, transport=httpx.MockTransport(handler))
    )
    body = make_client(handler).get("/api/v1/auth/upstox/status?verify=true").json()
    assert body["verified"] is True and body["connected"] is True
    assert calls == [f"Bearer {ACCESS_TOKEN}"]

    monkeypatch.setattr(
        upstox_auth, "UpstoxClient",
        lambda s: UpstoxClient(s, transport=httpx.MockTransport(lambda r: httpx.Response(401, json={}))),
    )
    body = make_client(handler).get("/api/v1/auth/upstox/status?verify=true").json()
    assert body["verified"] is False and body["connected"] is False


def test_token_expiry_is_0330_ist():
    from datetime import datetime, timezone

    # 2026-01-01 10:00 UTC = 15:30 IST -> expires 2026-01-02 03:30 IST = 2026-01-01 22:00 UTC
    assert store.upstox_token_expiry(datetime(2026, 1, 1, 10, tzinfo=timezone.utc)) == datetime(2026, 1, 1, 22, tzinfo=timezone.utc)
    # 2026-01-01 20:00 UTC = 01:30 IST Jan 2 -> expires same day 03:30 IST = 22:00 UTC Jan 1
    assert store.upstox_token_expiry(datetime(2026, 1, 1, 20, tzinfo=timezone.utc)) == datetime(2026, 1, 1, 22, tzinfo=timezone.utc)
