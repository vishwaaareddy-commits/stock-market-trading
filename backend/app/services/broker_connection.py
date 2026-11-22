"""Persistence of the encrypted provider access token."""

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import TokenCipher
from app.models.broker_connection import BrokerConnection

UPSTOX = "upstox"
IST = ZoneInfo("Asia/Kolkata")


def upstox_token_expiry(now: datetime | None = None) -> datetime:
    """Upstox access tokens expire at 03:30 IST on the next occurrence of that time."""
    now_ist = (now or datetime.now(timezone.utc)).astimezone(IST)
    expiry = datetime.combine(now_ist.date(), time(3, 30), tzinfo=IST)
    if now_ist >= expiry:
        expiry += timedelta(days=1)
    return expiry.astimezone(timezone.utc)


def save_token(
    db: Session,
    cipher: TokenCipher,
    provider: str,
    access_token: str,
    provider_user_id: str | None,
    expires_at: datetime,
) -> BrokerConnection:
    row = db.scalar(select(BrokerConnection).where(BrokerConnection.provider == provider))
    encrypted = cipher.encrypt(access_token)
    if row is None:
        row = BrokerConnection(
            provider=provider,
            encrypted_access_token=encrypted,
            provider_user_id=provider_user_id,
            expires_at=expires_at,
        )
        db.add(row)
    else:
        row.encrypted_access_token = encrypted
        row.provider_user_id = provider_user_id
        row.expires_at = expires_at
    db.commit()
    return row


def get_connection(db: Session, provider: str) -> BrokerConnection | None:
    return db.scalar(select(BrokerConnection).where(BrokerConnection.provider == provider))


def is_expired(row: BrokerConnection, now: datetime | None = None) -> bool:
    if row.expires_at is None:
        return False
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=timezone.utc)
    return (now or datetime.now(timezone.utc)) >= expires
