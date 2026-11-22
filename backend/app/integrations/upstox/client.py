"""Read-only Upstox client: OAuth token exchange, profile check, V3 historical candles.

No order, portfolio or funds endpoints are implemented, by design (paper trading only).
Error messages never include tokens, the client secret or authorization codes.
"""

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from urllib.parse import quote, urlencode

import httpx

from app.core.config import Settings

AUTH_DIALOG_PATH = "/v2/login/authorization/dialog"
TOKEN_PATH = "/v2/login/authorization/token"
PROFILE_PATH = "/v2/user/profile"
HISTORICAL_PATH = "/v3/historical-candle"

VALID_UNITS = {"minutes", "hours", "days", "weeks", "months"}
MAX_INTERVAL = {"minutes": 300, "hours": 5, "days": 1, "weeks": 1, "months": 1}


class UpstoxError(Exception):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class UpstoxAuthError(UpstoxError):
    """Credentials, authorization code or access token rejected by Upstox."""


class UpstoxResponseError(UpstoxError):
    """Upstox answered, but the payload was not in the expected shape."""


@dataclass(frozen=True)
class TokenResponse:
    access_token: str
    user_id: str | None
    user_name: str | None


@dataclass(frozen=True)
class HistoricalCandle:
    timestamp: datetime  # timezone-aware, start of the bar
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: int
    open_interest: int


def _error_message(response: httpx.Response) -> str:
    try:
        body = response.json()
        errors = body.get("errors") if isinstance(body, dict) else None
        if errors and isinstance(errors, list) and isinstance(errors[0], dict):
            msg = errors[0].get("message") or errors[0].get("errorCode")
            if msg:
                return f"Upstox error (HTTP {response.status_code}): {msg}"
    except ValueError:
        pass
    return f"Upstox error (HTTP {response.status_code})"


class UpstoxClient:
    def __init__(
        self,
        settings: Settings,
        transport: httpx.BaseTransport | None = None,
        timeout: float = 15.0,
    ) -> None:
        self._settings = settings
        self._transport = transport
        self._timeout = timeout

    # --- plumbing ---------------------------------------------------------------------
    def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        url = f"{self._settings.upstox_base_url.rstrip('/')}{path}"
        try:
            with httpx.Client(transport=self._transport, timeout=self._timeout) as http:
                response = http.request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            raise UpstoxError(f"Could not reach Upstox ({type(exc).__name__})") from exc
        if response.status_code in (400, 401, 403) and "/login/" in path:
            raise UpstoxAuthError(_error_message(response), response.status_code)
        if response.status_code == 401:
            raise UpstoxAuthError(_error_message(response), 401)
        if response.status_code >= 400:
            raise UpstoxError(_error_message(response), response.status_code)
        return response

    @staticmethod
    def _json(response: httpx.Response) -> dict:
        try:
            body = response.json()
        except ValueError as exc:
            raise UpstoxResponseError("Upstox returned invalid JSON") from exc
        if not isinstance(body, dict):
            raise UpstoxResponseError("Upstox returned an unexpected payload")
        return body

    # --- OAuth ------------------------------------------------------------------------
    def build_authorization_url(self, state: str) -> str:
        query = urlencode(
            {
                "client_id": self._settings.upstox_client_id,
                "redirect_uri": self._settings.upstox_redirect_uri,
                "response_type": "code",
                "state": state,
            }
        )
        return f"{self._settings.upstox_base_url.rstrip('/')}{AUTH_DIALOG_PATH}?{query}"

    def exchange_code(self, code: str) -> TokenResponse:
        response = self._request(
            "POST",
            TOKEN_PATH,
            headers={"Accept": "application/json"},
            data={
                "code": code,
                "client_id": self._settings.upstox_client_id,
                "client_secret": self._settings.upstox_client_secret,
                "redirect_uri": self._settings.upstox_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        body = self._json(response)
        token = body.get("access_token")
        if not isinstance(token, str) or not token:
            raise UpstoxResponseError("Upstox token response did not contain an access token")
        user_id = body.get("user_id")
        user_name = body.get("user_name")
        return TokenResponse(
            access_token=token,
            user_id=str(user_id) if user_id else None,
            user_name=str(user_name) if user_name else None,
        )

    # --- read-only data ---------------------------------------------------------------
    @staticmethod
    def _auth_headers(access_token: str) -> dict[str, str]:
        return {"Accept": "application/json", "Authorization": f"Bearer {access_token}"}

    def get_profile_user_id(self, access_token: str) -> str | None:
        """Cheap authenticated call used to verify that a stored token still works."""
        response = self._request("GET", PROFILE_PATH, headers=self._auth_headers(access_token))
        data = self._json(response).get("data")
        user_id = data.get("user_id") if isinstance(data, dict) else None
        return str(user_id) if user_id else None

    def get_historical_candles(
        self,
        access_token: str,
        instrument_key: str,
        from_date: date,
        to_date: date,
        unit: str = "minutes",
        interval: int = 15,
    ) -> list[HistoricalCandle]:
        """V3 historical candles, returned oldest first. Default is 15-minute bars."""
        if unit not in VALID_UNITS:
            raise ValueError(f"unit must be one of {sorted(VALID_UNITS)}")
        if not 1 <= interval <= MAX_INTERVAL[unit]:
            raise ValueError(f"interval for {unit} must be between 1 and {MAX_INTERVAL[unit]}")
        if from_date > to_date:
            raise ValueError("from_date must not be after to_date")
        if not instrument_key.strip():
            raise ValueError("instrument_key is required")

        # V3 path order is .../:unit/:interval/:to_date/:from_date
        path = (
            f"{HISTORICAL_PATH}/{quote(instrument_key, safe='')}/{unit}/{interval}"
            f"/{to_date.isoformat()}/{from_date.isoformat()}"
        )
        response = self._request("GET", path, headers=self._auth_headers(access_token))
        return self.parse_candles(self._json(response))

    @staticmethod
    def parse_candles(body: dict) -> list[HistoricalCandle]:
        data = body.get("data")
        rows = data.get("candles") if isinstance(data, dict) else None
        if not isinstance(rows, list):
            raise UpstoxResponseError("Historical candle response is missing data.candles")

        candles: list[HistoricalCandle] = []
        for row in rows:
            if not isinstance(row, list) or len(row) < 6:
                raise UpstoxResponseError("Malformed candle row in Upstox response")
            try:
                ts = datetime.fromisoformat(str(row[0]))
                if ts.tzinfo is None:
                    raise ValueError("timestamp has no timezone")
                candles.append(
                    HistoricalCandle(
                        timestamp=ts,
                        open=Decimal(str(row[1])),
                        high=Decimal(str(row[2])),
                        low=Decimal(str(row[3])),
                        close=Decimal(str(row[4])),
                        volume=int(row[5]),
                        open_interest=int(row[6]) if len(row) > 6 and row[6] is not None else 0,
                    )
                )
            except (ValueError, InvalidOperation, TypeError) as exc:
                raise UpstoxResponseError("Malformed candle values in Upstox response") from exc
        candles.sort(key=lambda c: c.timestamp)  # Upstox returns newest first
        return candles
