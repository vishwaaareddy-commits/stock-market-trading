"""Login, sessions, throttling and presence. No secret is ever logged or returned."""

import hashlib
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.passwords import (
    PasswordPolicyError,
    hash_password,
    needs_rehash,
    validate_password,
    verify_password,
)
from app.models.auth_session import AuthSession
from app.models.enums import UserRole
from app.models.login_attempt import LoginAttempt
from app.models.user import User
from app.services import audit


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(dt: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; treat them as UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class InvalidCredentials(Exception):
    pass


class Throttled(Exception):
    def __init__(self, retry_after: int) -> None:
        super().__init__("Too many failed attempts")
        self.retry_after = retry_after


# --- throttling -----------------------------------------------------------------------
def _failure_times(db: Session, column, value: str, since: datetime, limit: int) -> list[datetime]:
    rows = db.scalars(
        select(LoginAttempt.created_at)
        .where(column == value, LoginAttempt.success.is_(False), LoginAttempt.created_at >= since)
        .order_by(LoginAttempt.created_at.desc())
        .limit(limit)
    ).all()
    return [as_utc(r) for r in rows]


def check_throttle(db: Session, identifier: str, ip: str | None, settings: Settings, now: datetime) -> None:
    window = timedelta(minutes=settings.login_window_minutes)
    since = now - window
    # A successful login resets the per-account counter (but not the per-IP one).
    last_success = db.scalar(
        select(func.max(LoginAttempt.created_at)).where(
            LoginAttempt.identifier == identifier, LoginAttempt.success.is_(True)
        )
    )
    account_since = max(since, as_utc(last_success)) if last_success else since
    checks = [(LoginAttempt.identifier, identifier, settings.login_max_failures, account_since)]
    if ip:
        checks.append((LoginAttempt.ip_address, ip, settings.login_ip_max_failures, since))
    for column, value, limit, from_time in checks:
        times = _failure_times(db, column, value, from_time, limit)
        if len(times) >= limit:
            unlock_at = times[limit - 1] + window
            raise Throttled(max(1, int((unlock_at - now).total_seconds()) + 1))


def _record_attempt(db: Session, identifier: str, ip: str | None, success: bool) -> None:
    db.add(LoginAttempt(identifier=identifier[:320], ip_address=ip, success=success))


# --- login / sessions -----------------------------------------------------------------
def find_user_for_login(db: Session, identifier: str) -> User | None:
    ident = identifier.strip().lower()
    return db.scalar(select(User).where(or_(User.username == ident, User.email == ident)))


@dataclass
class LoginResult:
    user: User
    token: str
    session: AuthSession


_SAME = object()


def login(
    db: Session,
    settings: Settings,
    identifier: str,
    password: str,
    *,
    ip: str | None,
    user_agent: str | None,
    now: datetime | None = None,
    throttle_ip: "str | None | object" = _SAME,
) -> LoginResult:
    """`ip` is recorded for audit. `throttle_ip` is the key for the per-IP limit: it defaults
    to `ip`, and None means the address is unreliable (e.g. an unverified proxy hop), so only
    the per-account limit applies."""
    now = now or utcnow()
    ident = identifier.strip().lower()
    key = ip if throttle_ip is _SAME else throttle_ip
    check_throttle(db, ident, key, settings, now)  # raises Throttled

    user = find_user_for_login(db, ident)
    # Always run one Argon2 verification so timing does not reveal whether the user exists.
    ok = verify_password(password, user.hashed_password if user else None)
    usable = bool(user and ok and user.is_active and user.deleted_at is None)

    if not usable:
        _record_attempt(db, ident, ip, False)
        audit.record(
            db,
            "LOGIN_FAILURE",
            actor=user,
            resource_type="user" if user else None,
            resource_id=user.id if user else None,
            details={"known_user": user is not None, "reason": "inactive" if (user and ok) else "bad_credentials"},
            ip=ip,
        )
        db.commit()
        raise InvalidCredentials()

    assert user is not None
    _record_attempt(db, ident, ip, True)

    if needs_rehash(user.hashed_password or ""):
        user.hashed_password = hash_password(password)

    token = secrets.token_urlsafe(32)
    session = AuthSession(
        user_id=user.id,
        token_hash=hash_token(token),
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(hours=settings.session_absolute_hours),
        ip_address=ip,
        user_agent=(user_agent or "")[:255] or None,
    )
    db.add(session)
    user.last_login_at = now
    user.last_activity_at = now
    user.last_heartbeat_at = now
    db.flush()
    audit.record(db, "LOGIN_SUCCESS", actor=user, resource_type="user", resource_id=user.id, ip=ip)
    audit.record(
        db, "SESSION_CREATED", actor=user, resource_type="session", resource_id=session.id, ip=ip
    )
    db.commit()
    return LoginResult(user=user, token=token, session=session)


def session_is_valid(session: AuthSession, settings: Settings, now: datetime) -> bool:
    if session.revoked_at is not None:
        return False
    if as_utc(session.expires_at) <= now:
        return False
    idle = timedelta(minutes=settings.session_idle_minutes)
    return as_utc(session.last_seen_at) + idle > now


def resolve_session(
    db: Session, settings: Settings, raw_token: str | None, now: datetime | None = None
) -> tuple[AuthSession, User] | None:
    """Return (session, user) for a valid cookie token, else None. Touches last_seen_at."""
    if not raw_token:
        return None
    now = now or utcnow()
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(raw_token)))
    if session is None or not session_is_valid(session, settings, now):
        return None
    user = db.get(User, session.user_id)
    if user is None or not user.is_active or user.deleted_at is not None:
        return None
    if (now - as_utc(session.last_seen_at)).total_seconds() >= 15:  # avoid a write per request
        session.last_seen_at = now
        db.commit()
    return session, user


def revoke_session(db: Session, session: AuthSession, reason: str, now: datetime | None = None) -> None:
    if session.revoked_at is None:
        session.revoked_at = now or utcnow()
        session.revoked_reason = reason


def revoke_user_sessions(
    db: Session, user_id: int, reason: str, *, except_session_id: int | None = None, now: datetime | None = None
) -> int:
    stmt = select(AuthSession).where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
    if except_session_id is not None:
        stmt = stmt.where(AuthSession.id != except_session_id)
    sessions = db.scalars(stmt).all()
    for s in sessions:
        revoke_session(db, s, reason, now)
    return len(sessions)


def active_sessions(db: Session, user_id: int, settings: Settings, now: datetime | None = None) -> list[AuthSession]:
    now = now or utcnow()
    rows = db.scalars(
        select(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .order_by(AuthSession.created_at.desc())
    ).all()
    return [s for s in rows if session_is_valid(s, settings, now)]


def change_password(
    db: Session, settings: Settings, user: User, new_password: str, *, now: datetime | None = None
) -> None:
    validate_password(
        new_password,
        min_length=settings.min_password_length,
        forbidden=[user.username, user.email.split("@")[0]],
    )
    user.hashed_password = hash_password(new_password)
    user.must_change_password = False
    user.password_changed_at = now or utcnow()


# --- presence -------------------------------------------------------------------------
def heartbeat(db: Session, session: AuthSession, user: User, now: datetime | None = None) -> None:
    now = now or utcnow()
    session.last_seen_at = now
    user.last_heartbeat_at = now
    db.commit()


def touch_activity(user: User, now: datetime | None = None) -> None:
    user.last_activity_at = now or utcnow()


def active_session_counts(db: Session, settings: Settings, now: datetime | None = None) -> dict[int, int]:
    now = now or utcnow()
    idle_cutoff = now - timedelta(minutes=settings.session_idle_minutes)
    rows = db.execute(
        select(AuthSession.user_id, AuthSession.expires_at, AuthSession.last_seen_at).where(
            AuthSession.revoked_at.is_(None)
        )
    ).all()
    counts: dict[int, int] = {}
    for uid, exp, seen in rows:
        if as_utc(exp) > now and as_utc(seen) > idle_cutoff:
            counts[uid] = counts.get(uid, 0) + 1
    return counts


def is_online(user: User, session_count: int, settings: Settings, now: datetime | None = None) -> bool:
    """Online only with a recent authenticated heartbeat AND a live session."""
    now = now or utcnow()
    if not user.is_active or user.deleted_at is not None or session_count < 1:
        return False
    hb = as_utc(user.last_heartbeat_at)
    return hb is not None and (now - hb).total_seconds() <= settings.heartbeat_timeout_seconds
