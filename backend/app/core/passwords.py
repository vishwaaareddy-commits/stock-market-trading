"""Argon2id password hashing and password policy. Never log or return passwords/hashes."""

import re
import secrets
import string

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

# argon2-cffi defaults to Argon2id with RFC 9106 low-memory parameters.
_hasher = PasswordHasher()

# Verified against when a login names a non-existent user, so timing does not reveal
# whether an account exists.
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing-equalisation")


class PasswordPolicyError(ValueError):
    pass


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, hashed: str | None) -> bool:
    """Constant-effort verify; a missing hash still costs one Argon2 verification."""
    try:
        return _hasher.verify(hashed or _DUMMY_HASH, password) and hashed is not None
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(hashed: str) -> bool:
    return _hasher.check_needs_rehash(hashed)


def validate_password(password: str, *, min_length: int, forbidden: list[str] | None = None) -> None:
    if len(password) < min_length:
        raise PasswordPolicyError(f"Password must be at least {min_length} characters")
    if len(password) > 256:
        raise PasswordPolicyError("Password is too long")
    classes = sum(
        bool(re.search(p, password)) for p in (r"[a-z]", r"[A-Z]", r"\d", r"[^A-Za-z0-9]")
    )
    if classes < 3:
        raise PasswordPolicyError(
            "Password must include at least three of: lowercase, uppercase, digit, symbol"
        )
    lowered = password.lower()
    for word in forbidden or []:
        if word and len(word) >= 3 and word.lower() in lowered:
            raise PasswordPolicyError("Password must not contain your username or email")


def generate_temp_password(length: int = 16) -> str:
    """Random password that satisfies the policy. Shown to the Super Admin exactly once."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*-_=+"
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(c.islower() for c in pw)
            and any(c.isupper() for c in pw)
            and any(c.isdigit() for c in pw)
            and any(c in "!@#$%^&*-_=+" for c in pw)
        ):
            return pw
