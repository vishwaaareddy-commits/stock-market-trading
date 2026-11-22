from collections.abc import Iterator

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.security import TokenCipher, TokenCryptoError
from app.db.session import DatabaseNotConfiguredError, get_session_factory
from app.integrations.upstox import UpstoxClient


def get_db_or_503() -> Iterator[Session]:
    try:
        factory = get_session_factory()
    except DatabaseNotConfiguredError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Database is not configured")
    with factory() as session:
        yield session


def require_upstox_settings(settings: Settings = Depends(get_settings)) -> Settings:
    if not settings.upstox_configured:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Upstox integration is not configured"
        )
    return settings


def get_upstox_client(settings: Settings = Depends(require_upstox_settings)) -> UpstoxClient:
    return UpstoxClient(settings)


def get_token_cipher(settings: Settings = Depends(require_upstox_settings)) -> TokenCipher:
    try:
        return TokenCipher(settings.upstox_token_encryption_key)
    except TokenCryptoError:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Upstox token encryption key is invalid"
        )
