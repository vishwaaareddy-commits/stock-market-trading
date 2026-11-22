"""Token encryption and OAuth state signing. Nothing here logs or returns secrets."""

import hashlib
import hmac
import secrets
import time

from cryptography.fernet import Fernet, InvalidToken


class TokenCryptoError(Exception):
    pass


class TokenCipher:
    """Fernet (AES-128-CBC + HMAC-SHA256) encryption for tokens stored in the database."""

    def __init__(self, key: str) -> None:
        try:
            self._fernet = Fernet(key.strip().encode())
        except (ValueError, TypeError) as exc:
            raise TokenCryptoError(
                "UPSTOX_TOKEN_ENCRYPTION_KEY is not a valid Fernet key"
            ) from exc

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken as exc:
            raise TokenCryptoError("Stored token cannot be decrypted (wrong key?)") from exc


def generate_encryption_key() -> str:
    return Fernet.generate_key().decode()


# --- OAuth state: "<nonce>.<issued_at>.<signature>" -------------------------------------
# The nonce is also set in an HttpOnly cookie, so the callback only accepts a state that
# was issued to THIS browser (CSRF protection) and has not expired.

STATE_MAX_AGE_SECONDS = 600


def _sign(secret: str, payload: str) -> str:
    key = hashlib.sha256(f"oauth-state:{secret}".encode()).digest()
    return hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()


def create_state(secret: str, now: float | None = None) -> tuple[str, str]:
    """Return (state, nonce). Put `state` in the authorization URL and `nonce` in a cookie."""
    nonce = secrets.token_urlsafe(24)
    issued_at = str(int(now if now is not None else time.time()))
    payload = f"{nonce}.{issued_at}"
    return f"{payload}.{_sign(secret, payload)}", nonce


def verify_state(
    secret: str,
    state: str | None,
    cookie_nonce: str | None,
    now: float | None = None,
    max_age: int = STATE_MAX_AGE_SECONDS,
) -> bool:
    if not state or not cookie_nonce:
        return False
    parts = state.split(".")
    if len(parts) != 3:
        return False
    nonce, issued_at, signature = parts
    if not hmac.compare_digest(signature, _sign(secret, f"{nonce}.{issued_at}")):
        return False
    if not hmac.compare_digest(nonce, cookie_nonce):
        return False
    try:
        age = (now if now is not None else time.time()) - int(issued_at)
    except ValueError:
        return False
    return 0 <= age <= max_age
