from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import (
    client_identity,
    client_ip,
    get_current_user,
    get_current_user_allow_pending,
    get_db_or_503,
    get_session_and_user,
)
from app.core.config import Settings, get_settings
from app.core.passwords import PasswordPolicyError, verify_password
from app.models.user import User
from app.schemas.api import ChangePasswordIn, LoginIn, PageViewIn, UserOut
from app.services import audit
from app.services import auth as auth_service

router = APIRouter(tags=["auth"])


def _set_cookie(response: Response, settings: Settings, token: str) -> None:
    response.set_cookie(
        settings.session_cookie_name,
        token,
        max_age=settings.session_absolute_hours * 3600,
        httponly=True,  # not readable by JavaScript
        secure=settings.app_env == "production",
        samesite="lax",
        path="/",
    )


def _clear_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(settings.session_cookie_name, path="/")


@router.post("/auth/login")
def login(
    body: LoginIn,
    request: Request,
    response: Response,
    db: Session = Depends(get_db_or_503),
    settings: Settings = Depends(get_settings),
) -> dict:
    who = client_identity(request, settings)
    try:
        result = auth_service.login(
            db, settings, body.identifier, body.password, ip=who.address,
            user_agent=request.headers.get("user-agent"), throttle_ip=who.throttle_key,
        )
    except auth_service.Throttled as exc:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many failed login attempts. Try again later.",
            headers={"Retry-After": str(exc.retry_after)},
        )
    except auth_service.InvalidCredentials:
        # Identical response for unknown user, wrong password and deactivated account.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid username or password")
    _set_cookie(response, settings, result.token)
    return {"user": UserOut.model_validate(result.user)}


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db_or_503),
    settings: Settings = Depends(get_settings),
) -> Response:
    resolved = auth_service.resolve_session(db, settings, request.cookies.get(settings.session_cookie_name))
    if resolved:
        session, user = resolved
        auth_service.revoke_session(db, session, "logout")
        audit.record(db, "LOGOUT", actor=user, resource_type="session", resource_id=session.id,
                     ip=client_ip(request, settings))
        db.commit()
    out = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_cookie(out, settings)
    return out


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(get_current_user_allow_pending)) -> User:
    return user


@router.post("/auth/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    body: ChangePasswordIn,
    request: Request,
    resolved=Depends(get_session_and_user),
    db: Session = Depends(get_db_or_503),
    settings: Settings = Depends(get_settings),
) -> Response:
    session, user = resolved
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    if body.new_password == body.current_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "New password must differ from the current one")
    try:
        auth_service.change_password(db, settings, user, body.new_password)
    except PasswordPolicyError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    # Every other session is revoked; this one continues.
    revoked = auth_service.revoke_user_sessions(db, user.id, "password_changed", except_session_id=session.id)
    audit.record(db, "PASSWORD_CHANGED", actor=user, resource_type="user", resource_id=user.id,
                 details={"other_sessions_revoked": revoked}, ip=client_ip(request, settings))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/auth/heartbeat")
def heartbeat(
    resolved=Depends(get_session_and_user),
    db: Session = Depends(get_db_or_503),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Authenticated presence ping. A user is 'online' only while these keep arriving."""
    session, user = resolved
    auth_service.heartbeat(db, session, user)
    return {"status": "ok", "timeout_seconds": settings.heartbeat_timeout_seconds}


@router.post("/activity/page-view", status_code=status.HTTP_204_NO_CONTENT)
def page_view(
    body: PageViewIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_or_503),
    settings: Settings = Depends(get_settings),
) -> Response:
    """Records that the signed-in user opened a section. Only whitelisted page names are
    accepted: no free text, no content, no screen or keystroke data."""
    audit.record(db, "PAGE_VIEW", actor=user, resource_type="page", resource_id=body.page,
                 ip=client_ip(request, settings))
    auth_service.touch_activity(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
