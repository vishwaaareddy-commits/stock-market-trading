from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_db_or_503, get_token_cipher, get_upstox_client
from app.core.security import TokenCipher, TokenCryptoError
from app.integrations.upstox import UpstoxAuthError, UpstoxClient, UpstoxError
from app.services import broker_connection as store

router = APIRouter(prefix="/market-data/upstox", tags=["market-data"])

DEFAULT_INSTRUMENT_KEY = "NSE_EQ|INE002A01018"  # connectivity probe only


@router.get("/test")
def test_connection(
    instrument_key: str = Query(default=DEFAULT_INSTRUMENT_KEY, pattern=r"^[A-Z_]{2,20}\|[A-Za-z0-9_-]{1,40}$"),
    days: int = Query(default=5, ge=1, le=30),
    client: UpstoxClient = Depends(get_upstox_client),
    cipher: TokenCipher = Depends(get_token_cipher),
    db: Session = Depends(get_db_or_503),
) -> dict:
    """Fetch a few recent 15-minute candles to prove market-data access works.

    Returns only a summary (count and time range), never the token.
    """
    row = store.get_connection(db, store.UPSTOX)
    if row is None or store.is_expired(row):
        raise HTTPException(status.HTTP_409_CONFLICT, "Upstox is not connected or the token expired")
    try:
        token = cipher.decrypt(row.encrypted_access_token)
    except TokenCryptoError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Stored token cannot be decrypted")

    today = date.today()
    try:
        candles = client.get_historical_candles(
            token, instrument_key, today - timedelta(days=days), today, unit="minutes", interval=15
        )
    except UpstoxAuthError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Upstox rejected the stored token; reconnect")
    except UpstoxError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))

    return {
        "status": "ok",
        "instrument_key": instrument_key,
        "timeframe": "15m",
        "candle_count": len(candles),
        "first_candle": candles[0].timestamp.isoformat() if candles else None,
        "last_candle": candles[-1].timestamp.isoformat() if candles else None,
    }
