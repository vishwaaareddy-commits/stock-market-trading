"""Admin account management (Super Admin only; permission is enforced in the route layer).

Accounts are never hard-deleted. Soft delete keeps the row, wallet, ledger, orders, trades and
audit history, and keeps the username/email reserved so history can never be re-attributed.
"""

import re
from datetime import datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.passwords import (
    PasswordPolicyError,
    generate_temp_password,
    hash_password,
    validate_password,
)
from app.models.enums import UserRole
from app.models.user import User
from app.services import audit
from app.services import auth as auth_service
from app.services import paper as paper_service
from app.services import wallet as wallets

USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,31}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UserError(Exception):
    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def normalize_username(value: str) -> str:
    v = (value or "").strip().lower()
    if not USERNAME_RE.match(v):
        raise UserError("invalid_username", "Username must be 3-32 characters: a-z, 0-9, '.', '_' or '-'")
    return v


def normalize_email(value: str) -> str:
    v = (value or "").strip().lower()
    if not EMAIL_RE.match(v) or len(v) > 320:
        raise UserError("invalid_email", "Enter a valid email address")
    return v


def _resolve_password(settings: Settings, username: str, email: str, password: str | None) -> tuple[str, str | None]:
    """Return (password, generated_temp_or_None)."""
    if password:
        try:
            validate_password(password, min_length=settings.min_password_length, forbidden=[username, email.split("@")[0]])
        except PasswordPolicyError as exc:
            raise UserError("weak_password", str(exc)) from exc
        return password, None
    temp = generate_temp_password()
    return temp, temp


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise UserError("not_found", "User not found", 404)
    return user


def get_managed_admin(db: Session, user_id: int) -> User:
    """A normal Admin account that can be managed. Super Admins and deleted accounts cannot."""
    user = get_user(db, user_id)
    if user.role != UserRole.ADMIN:
        raise UserError("forbidden_target", "Super Admin accounts cannot be managed here", 403)
    if user.deleted_at is not None:
        raise UserError("deleted", "Account has been deleted", 409)
    return user


def create_admin(
    db: Session, settings: Settings, actor: User, *, username: str, email: str, display_name: str | None,
    password: str | None, initial_balance: Decimal, ip: str | None = None,
) -> tuple[User, str | None]:
    username, email = normalize_username(username), normalize_email(email)
    if db.scalar(select(User.id).where((User.username == username) | (User.email == email))):
        raise UserError("duplicate", "Username or email is already in use", 409)
    pw, temp = _resolve_password(settings, username, email, password)
    user = User(
        username=username, email=email, display_name=(display_name or "").strip()[:120] or None,
        hashed_password=hash_password(pw),
        role=UserRole.ADMIN,  # the only role this path can create
        is_active=True, must_change_password=True, created_by_id=actor.id,
    )
    db.add(user)
    db.flush()
    wallets.ensure_wallet(db, user.id)
    wallets.credit_initial(db, user, initial_balance, actor)
    audit.record(db, "USER_CREATED", actor=actor, resource_type="user", resource_id=user.id,
                 details={"username": username, "role": "ADMIN", "initial_balance": str(initial_balance),
                          "temporary_password_generated": temp is not None}, ip=ip)
    db.commit()
    return user, temp


def update_profile(db: Session, actor: User, target: User, *, display_name: str | None, email: str | None,
                   ip: str | None = None) -> User:
    changes = {}
    if email is not None:
        email = normalize_email(email)
        if email != target.email:
            if db.scalar(select(User.id).where(User.email == email, User.id != target.id)):
                raise UserError("duplicate", "Email is already in use", 409)
            target.email = email
            changes["email"] = email
    if display_name is not None:
        target.display_name = display_name.strip()[:120] or None
        changes["display_name"] = target.display_name
    audit.record(db, "USER_UPDATED", actor=actor, resource_type="user", resource_id=target.id,
                 details=changes, ip=ip)
    db.commit()
    return target


def set_active(db: Session, actor: User, target: User, active: bool, ip: str | None = None) -> int:
    """Activate/deactivate. Deactivation revokes every session immediately. Returns revoked count."""
    revoked = 0
    target.is_active = active
    if not active:
        revoked = auth_service.revoke_user_sessions(db, target.id, "account_deactivated")
    audit.record(db, "USER_REACTIVATED" if active else "USER_DEACTIVATED", actor=actor,
                 resource_type="user", resource_id=target.id, details={"sessions_revoked": revoked}, ip=ip)
    db.commit()
    return revoked


def soft_delete(db: Session, actor: User, target: User, ip: str | None = None, now: datetime | None = None) -> None:
    target.is_active = False
    target.deleted_at = now or auth_service.utcnow()
    revoked = auth_service.revoke_user_sessions(db, target.id, "account_deleted")
    # Release funds reserved by pending orders in the SAME transaction as the delete: either the
    # account is deleted and every reservation is returned (each an immutable ledger entry), or
    # nothing changes. Orders and trades are kept; pending orders become CANCELLED.
    cancelled, released = paper_service.cancel_all_pending(db, target.id, actor, "Account deleted", ip=ip)
    audit.record(db, "USER_DELETED", actor=actor, resource_type="user", resource_id=target.id,
                 details={"sessions_revoked": revoked, "soft_delete": True,
                          "pending_orders_cancelled": cancelled, "reserved_funds_released": str(released)}, ip=ip)
    db.commit()


def reset_password(db: Session, settings: Settings, actor: User, target: User, password: str | None,
                   ip: str | None = None) -> str | None:
    pw, temp = _resolve_password(settings, target.username, target.email, password)
    target.hashed_password = hash_password(pw)
    target.must_change_password = True
    target.password_changed_at = auth_service.utcnow()
    revoked = auth_service.revoke_user_sessions(db, target.id, "password_reset")
    audit.record(db, "PASSWORD_RESET", actor=actor, resource_type="user", resource_id=target.id,
                 details={"sessions_revoked": revoked, "temporary_password_generated": temp is not None}, ip=ip)
    db.commit()
    return temp
