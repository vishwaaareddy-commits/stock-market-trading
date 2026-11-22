import pytest
from cryptography.fernet import Fernet

from app.core.security import (
    STATE_MAX_AGE_SECONDS,
    TokenCipher,
    TokenCryptoError,
    create_state,
    verify_state,
)


def test_encrypt_decrypt_roundtrip():
    cipher = TokenCipher(Fernet.generate_key().decode())
    encrypted = cipher.encrypt("secret-token")
    assert "secret-token" not in encrypted
    assert cipher.decrypt(encrypted) == "secret-token"


def test_decrypt_with_wrong_key_fails():
    encrypted = TokenCipher(Fernet.generate_key().decode()).encrypt("x")
    with pytest.raises(TokenCryptoError):
        TokenCipher(Fernet.generate_key().decode()).decrypt(encrypted)


def test_invalid_key_rejected():
    with pytest.raises(TokenCryptoError):
        TokenCipher("not-a-fernet-key")


def test_state_valid():
    state, nonce = create_state("s", now=1000)
    assert verify_state("s", state, nonce, now=1001)


def test_state_rejects_missing_wrong_cookie_tampered_and_other_secret():
    state, nonce = create_state("s", now=1000)
    assert not verify_state("s", None, nonce, now=1001)
    assert not verify_state("s", state, None, now=1001)
    assert not verify_state("s", state, "other-nonce", now=1001)
    assert not verify_state("other", state, nonce, now=1001)
    assert not verify_state("s", state[:-2] + "00", nonce, now=1001)
    assert not verify_state("s", "garbage", nonce, now=1001)


def test_state_expiry_and_future_timestamps():
    state, nonce = create_state("s", now=1000)
    assert verify_state("s", state, nonce, now=1000 + STATE_MAX_AGE_SECONDS)
    assert not verify_state("s", state, nonce, now=1000 + STATE_MAX_AGE_SECONDS + 1)
    assert not verify_state("s", state, nonce, now=999)
