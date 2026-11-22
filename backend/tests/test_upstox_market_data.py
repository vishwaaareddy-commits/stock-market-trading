from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import httpx
import pytest

from app.core.config import get_settings
from app.core.security import TokenCipher
from app.integrations.upstox import (
    UpstoxAuthError,
    UpstoxClient,
    UpstoxError,
    UpstoxResponseError,
)
from app.services import broker_connection as store
from tests.conftest import ACCESS_TOKEN

CANDLES_OK = {
    "status": "success",
    "data": {
        "candles": [  # Upstox returns newest first
            ["2026-11-20T09:30:00+05:30", 101.5, 103.0, 101.0, 102.25, 5000, 0],
            ["2026-11-20T09:15:00+05:30", 100, 102, 99.5, 101.5, 12345, 0],
        ]
    },
}


def _client(handler) -> UpstoxClient:
    return UpstoxClient(get_settings(), transport=httpx.MockTransport(handler))


def test_historical_request_shape_for_15_minute_candles():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["raw_path"] = request.url.raw_path.decode()
        seen["auth"] = request.headers["authorization"]
        return httpx.Response(200, json=CANDLES_OK)

    _client(handler).get_historical_candles(
        ACCESS_TOKEN, "NSE_EQ|INE002A01018", date(2026, 11, 1), date(2026, 11, 20)
    )
    # V3 path order: instrument / unit / interval / to_date / from_date
    assert seen["raw_path"] == "/v3/historical-candle/NSE_EQ%7CINE002A01018/minutes/15/2026-11-20/2026-11-01"
    assert seen["auth"] == f"Bearer {ACCESS_TOKEN}"


def test_candles_parsed_sorted_oldest_first_with_decimals():
    candles = _client(lambda r: httpx.Response(200, json=CANDLES_OK)).get_historical_candles(
        ACCESS_TOKEN, "NSE_EQ|X", date(2026, 11, 20), date(2026, 11, 20)
    )
    assert [c.timestamp.minute for c in candles] == [15, 30]
    first = candles[0]
    assert first.open == Decimal("100") and first.high == Decimal("102")
    assert first.close == Decimal("101.5") and first.volume == 12345
    assert first.timestamp.utcoffset() == timedelta(hours=5, minutes=30)


def test_empty_candles_is_valid():
    out = _client(lambda r: httpx.Response(200, json={"status": "success", "data": {"candles": []}})).get_historical_candles(
        ACCESS_TOKEN, "NSE_EQ|X", date(2026, 11, 20), date(2026, 11, 20)
    )
    assert out == []


@pytest.mark.parametrize(
    "body",
    [
        {"status": "success"},
        {"data": {}},
        {"data": {"candles": "nope"}},
        {"data": {"candles": [["2026-11-20T09:15:00+05:30", 1, 2]]}},  # too few columns
        {"data": {"candles": [["not-a-date", 1, 2, 3, 4, 5]]}},
        {"data": {"candles": [["2026-11-20T09:15:00", 1, 2, 3, 4, 5]]}},  # naive timestamp
        {"data": {"candles": [["2026-11-20T09:15:00+05:30", "x", 2, 3, 4, 5]]}},
    ],
)
def test_malformed_candle_responses_raise(body):
    with pytest.raises(UpstoxResponseError):
        _client(lambda r: httpx.Response(200, json=body)).get_historical_candles(
            ACCESS_TOKEN, "NSE_EQ|X", date(2026, 11, 20), date(2026, 11, 20)
        )


def test_invalid_json_raises():
    with pytest.raises(UpstoxResponseError):
        _client(lambda r: httpx.Response(200, text="<html>")).get_historical_candles(
            ACCESS_TOKEN, "NSE_EQ|X", date(2026, 11, 20), date(2026, 11, 20)
        )


def test_provider_errors_are_mapped_without_leaking_token():
    err = {"status": "error", "errors": [{"errorCode": "UDAPI100050", "message": "Invalid token used to access API"}]}
    with pytest.raises(UpstoxAuthError) as auth:
        _client(lambda r: httpx.Response(401, json=err)).get_historical_candles(
            ACCESS_TOKEN, "NSE_EQ|X", date(2026, 11, 20), date(2026, 11, 20)
        )
    assert "Invalid token" in str(auth.value) and ACCESS_TOKEN not in str(auth.value)

    with pytest.raises(UpstoxError) as server:
        _client(lambda r: httpx.Response(429, json={})).get_historical_candles(
            ACCESS_TOKEN, "NSE_EQ|X", date(2026, 11, 20), date(2026, 11, 20)
        )
    assert server.value.status_code == 429 and not isinstance(server.value, UpstoxAuthError)


def test_network_error_wrapped():
    def handler(request):
        raise httpx.ConnectTimeout("slow")

    with pytest.raises(UpstoxError):
        _client(handler).get_historical_candles(ACCESS_TOKEN, "NSE_EQ|X", date(2026, 11, 20), date(2026, 11, 20))


@pytest.mark.parametrize(
    "kwargs",
    [
        {"unit": "seconds"},
        {"interval": 0},
        {"interval": 301},
        {"instrument_key": " "},
        {"from_date": date(2026, 12, 1)},
    ],
)
def test_argument_validation(kwargs):
    args = dict(access_token=ACCESS_TOKEN, instrument_key="NSE_EQ|X", from_date=date(2026, 11, 1), to_date=date(2026, 11, 20))
    args.update(kwargs)
    with pytest.raises(ValueError):
        _client(lambda r: httpx.Response(200, json=CANDLES_OK)).get_historical_candles(**args)


# --- /market-data/upstox/test endpoint ------------------------------------------------
def _connect(db_session, enc_key, expires_at=None):
    store.save_token(
        db_session, TokenCipher(enc_key), "upstox", ACCESS_TOKEN, "U1", expires_at or store.upstox_token_expiry()
    )


def test_connection_test_ok(make_client, db_session, enc_key):
    _connect(db_session, enc_key)
    r = make_client(lambda req: httpx.Response(200, json=CANDLES_OK)).get("/api/v1/market-data/upstox/test")
    body = r.json()
    assert r.status_code == 200 and body["status"] == "ok"
    assert body["candle_count"] == 2 and body["timeframe"] == "15m"
    assert ACCESS_TOKEN not in r.text


def test_connection_test_requires_connection(make_client, db_session, enc_key):
    client = make_client(lambda req: httpx.Response(200, json=CANDLES_OK))
    assert client.get("/api/v1/market-data/upstox/test").status_code == 409
    _connect(db_session, enc_key, datetime.now(timezone.utc) - timedelta(hours=1))
    assert client.get("/api/v1/market-data/upstox/test").status_code == 409


def test_connection_test_provider_failures(make_client, db_session, enc_key):
    _connect(db_session, enc_key)
    assert make_client(lambda r: httpx.Response(401, json={})).get("/api/v1/market-data/upstox/test").status_code == 401
    assert make_client(lambda r: httpx.Response(503, json={})).get("/api/v1/market-data/upstox/test").status_code == 502
    assert make_client(lambda r: httpx.Response(200, json={"data": {}})).get("/api/v1/market-data/upstox/test").status_code == 502


def test_connection_test_wrong_encryption_key(monkeypatch, make_client, db_session, enc_key):
    from cryptography.fernet import Fernet

    _connect(db_session, enc_key)
    monkeypatch.setenv("UPSTOX_TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    get_settings.cache_clear()
    r = make_client(lambda req: httpx.Response(200, json=CANDLES_OK)).get("/api/v1/market-data/upstox/test")
    assert r.status_code == 503


def test_connection_test_rejects_bad_instrument_key(make_client, db_session, enc_key):
    _connect(db_session, enc_key)
    r = make_client(lambda req: httpx.Response(200, json=CANDLES_OK)).get(
        "/api/v1/market-data/upstox/test", params={"instrument_key": "../../etc"}
    )
    assert r.status_code == 422
