import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Cookie, Depends, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db_or_503, get_token_cipher, get_upstox_client, require_upstox_settings
from app.core.config import Settings, get_settings
from app.core.security import STATE_MAX_AGE_SECONDS, TokenCipher, TokenCryptoError, create_state, verify_state
from app.integrations.upstox import UpstoxAuthError, UpstoxClient, UpstoxError
from app.services import broker_connection as store

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth/upstox", tags=["upstox-auth"])

NONCE_COOKIE = "upstox_oauth_nonce"


def _cookie_path(settings: Settings) -> str:
    return f"{settings.api_prefix}/auth/upstox"


def _finish(settings: Settings, result: str, reason: str | None = None) -> RedirectResponse:
    """Send the browser back to the dashboard. Never includes codes or tokens."""
    params = {"upstox": result}
    if reason:
        params["reason"] = reason
    response = RedirectResponse(
        f"{settings.frontend_url.rstrip('/')}/settings?{urlencode(params)}", status_code=302
    )
    response.delete_cookie(NONCE_COOKIE, path=_cookie_path(settings))
    return response


@router.get("/login")
def login(
    settings: Settings = Depends(require_upstox_settings),
    client: UpstoxClient = Depends(get_upstox_client),
) -> RedirectResponse:
    """Start OAuth: issue a signed state, bind it to this browser, redirect to Upstox."""
    state, nonce = create_state(settings.upstox_client_secret)
    response = RedirectResponse(client.build_authorization_url(state), status_code=302)
    response.set_cookie(
        NONCE_COOKIE,
        nonce,
        max_age=STATE_MAX_AGE_SECONDS,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="lax",
        path=_cookie_path(settings),
    )
    return response


@router.get("/callback")
def callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    nonce_cookie: str | None = Cookie(default=None, alias=NONCE_COOKIE),
    settings: Settings = Depends(require_upstox_settings),
    client: UpstoxClient = Depends(get_upstox_client),
    cipher: TokenCipher = Depends(get_token_cipher),
    db: Session = Depends(get_db_or_503),
) -> RedirectResponse:
    # 1. CSRF: state must be signed by us, unexpired and bound to this browser's cookie.
    if not verify_state(settings.upstox_client_secret, state, nonce_cookie):
        return _finish(settings, "error", "invalid_state")
    # 2. The user may have denied access at Upstox.
    if error:
        return _finish(settings, "error", "authorization_denied")
    if not code:
        return _finish(settings, "error", "missing_code")

    # 3. Exchange the code on the backend; the secret never reaches the browser.
    try:
        token = client.exchange_code(code)
    except UpstoxAuthError:
        return _finish(settings, "error", "invalid_credentials")
    except UpstoxError:
        logger.warning("Upstox token exchange failed")
        return _finish(settings, "error", "provider_error")

    allowed = settings.upstox_allowed_user_id.strip()
    if allowed and token.user_id != allowed:
        logger.warning("Rejected Upstox login from an unexpected user")
        return _finish(settings, "error", "user_not_allowed")

    # 4. Persist encrypted.
    try:
        store.save_token(
            db,
            cipher,
            store.UPSTOX,
            token.access_token,
            token.user_id,
            store.upstox_token_expiry(),
        )
    except Exception:  # never leak details; the token must not appear in logs
        logger.exception("Failed to store Upstox token")
        return _finish(settings, "error", "storage_failed")
    return _finish(settings, "connected")


@router.get("/status")
def status(
    verify: bool = Query(default=False, description="Also call Upstox to confirm the token works"),
    settings: Settings = Depends(get_settings),
    db: Session = Depends(get_db_or_503),
) -> dict:
    """Connection status for the frontend. Never returns tokens or secrets."""
    result: dict = {
        "provider": "upstox",
        "configured": settings.upstox_configured,
        "connected": False,
        "expired": False,
        "expires_at": None,
        "verified": None,
    }
    if not settings.upstox_configured:
        return result
    row = store.get_connection(db, store.UPSTOX)
    if row is None:
        return result
    expired = store.is_expired(row)
    result["expired"] = expired
    result["connected"] = not expired
    result["expires_at"] = row.expires_at.isoformat() if row.expires_at else None

    if verify and not expired:
        try:
            token = TokenCipher(settings.upstox_token_encryption_key).decrypt(
                row.encrypted_access_token
            )
            UpstoxClient(settings).get_profile_user_id(token)
            result["verified"] = True
        except (TokenCryptoError, UpstoxError):
            result["verified"] = False
            result["connected"] = False
    return result
