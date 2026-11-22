from collections.abc import Iterator

from fastapi import Cookie, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.clientip import ClientIdentity, resolve_client
from app.core.config import Settings, get_settings
from app.core.security import TokenCipher, TokenCryptoError
from app.db.session import DatabaseNotConfiguredError, get_session_factory
from app.integrations.upstox import UpstoxClient
from app.models.auth_session import AuthSession
from app.models.enums import UserRole
from app.models.user import User
from app.services import auth as auth_service


def get_db_or_503() -> Iterator[Session]:
    try:
        factory = get_session_factory()
    except DatabaseNotConfiguredError:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Database is not configured")
    with factory() as session:
        yield session


# --- authentication ---------------------------------------------------------------------
def client_identity(request: Request, settings: Settings) -> ClientIdentity:
    """Client address derived ONLY from the TCP peer and headers added by trusted proxies."""
    return resolve_client(
        request.client.host if request.client else None,
        request.headers.get("x-forwarded-for"),
        request.headers.get("x-proxy-secret"),
        settings,
    )


def client_ip(request: Request, settings: Settings) -> str | None:
    """Address recorded in audit logs and sessions (never trusts client-supplied headers)."""
    return client_identity(request, settings).address


def _session_cookie(request: Request, settings: Settings) -> str | None:
    return request.cookies.get(settings.session_cookie_name)


def get_session_and_user(
    request: Request,
    db: Session = Depends(get_db_or_503),
    settings: Settings = Depends(get_settings),
) -> tuple[AuthSession, User]:
    """Valid session -> (session, user). Used by endpoints that must work even while a
    password change is pending (me, change-password, logout, heartbeat)."""
    resolved = auth_service.resolve_session(db, settings, _session_cookie(request, settings))
    if resolved is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return resolved


def get_current_user_allow_pending(resolved=Depends(get_session_and_user)) -> User:
    return resolved[1]


def get_current_user(user: User = Depends(get_current_user_allow_pending)) -> User:
    """Authenticated, active user whose password is not pending a forced change."""
    if user.must_change_password:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "password_change_required")
    return user


def require_super_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Super Admin access required")
    return user


# --- Upstox -----------------------------------------------------------------------------
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
