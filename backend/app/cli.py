"""Management commands. Run from backend/:  python -m app.cli bootstrap-superadmin

bootstrap-superadmin creates the FIRST Super Admin from environment variables:
  BOOTSTRAP_SUPERADMIN_USERNAME, BOOTSTRAP_SUPERADMIN_EMAIL, BOOTSTRAP_SUPERADMIN_PASSWORD
It refuses to run if a Super Admin already exists, so it cannot be used to add or promote
accounts later. Remove the password from the environment after it has run.
"""

import sys

from sqlalchemy import select

from app.core.config import get_settings
from app.core.passwords import PasswordPolicyError, hash_password, validate_password
from app.db.session import DatabaseNotConfiguredError, get_session_factory
from app.models.enums import UserRole
from app.models.user import User
from app.services import audit
from app.services import users as user_service
from app.services import wallet as wallets


def bootstrap_superadmin(db, settings) -> str:
    """Returns a status message; raises SystemExit-worthy errors as ValueError."""
    if db.scalar(select(User.id).where(User.role == UserRole.SUPER_ADMIN)):
        return "A Super Admin already exists; nothing to do."
    username = settings.bootstrap_superadmin_username
    email = settings.bootstrap_superadmin_email
    password = settings.bootstrap_superadmin_password
    if not (username and email and password):
        raise ValueError(
            "Set BOOTSTRAP_SUPERADMIN_USERNAME, BOOTSTRAP_SUPERADMIN_EMAIL and "
            "BOOTSTRAP_SUPERADMIN_PASSWORD, then run this command again."
        )
    try:
        username = user_service.normalize_username(username)
        email = user_service.normalize_email(email)
        validate_password(password, min_length=settings.min_password_length,
                          forbidden=[username, email.split("@")[0]])
    except (user_service.UserError, PasswordPolicyError) as exc:
        raise ValueError(str(getattr(exc, "message", exc))) from exc
    if db.scalar(select(User.id).where((User.username == username) | (User.email == email))):
        raise ValueError("That username or email is already in use by a non-Super-Admin account.")

    user = User(username=username, email=email, display_name="Super Admin",
                hashed_password=hash_password(password), role=UserRole.SUPER_ADMIN,
                is_active=True, must_change_password=False)
    db.add(user)
    db.flush()
    wallets.ensure_wallet(db, user.id)
    audit.record(db, "SUPER_ADMIN_BOOTSTRAPPED", actor=user, resource_type="user", resource_id=user.id)
    db.commit()
    return f"Super Admin '{username}' created. Remove BOOTSTRAP_SUPERADMIN_PASSWORD from the environment now."


def main(argv: list[str]) -> int:
    if argv[:1] != ["bootstrap-superadmin"]:
        print(__doc__)
        return 2
    settings = get_settings()
    try:
        factory = get_session_factory()
    except DatabaseNotConfiguredError:
        print("DATABASE_URL is not set.")
        return 1
    with factory() as db:
        try:
            print(bootstrap_superadmin(db, settings))
        except ValueError as exc:
            print(f"Error: {exc}")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
