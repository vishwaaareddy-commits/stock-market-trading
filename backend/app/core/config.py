from decimal import Decimal
from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment variables / backend/.env."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "Stock Market Trading System"
    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )
    # Where the browser is sent after the OAuth callback finishes.
    frontend_url: str = "http://localhost:3000"

    # Empty means "not configured yet"; the app still starts without a database.
    database_url: str = ""

    # Only paper trading exists. No broker integration is implemented.
    trading_mode: Literal["paper"] = "paper"

    # Upstox (read-only market data). Secrets live ONLY in backend environment variables.
    upstox_client_id: str = ""
    upstox_client_secret: str = ""
    upstox_redirect_uri: str = ""
    # Fernet key (urlsafe base64, 32 bytes) used to encrypt the stored access token.
    upstox_token_encryption_key: str = ""
    # Optional: only accept an OAuth login from this Upstox user id (prevents token overwrite).
    upstox_allowed_user_id: str = ""
    upstox_base_url: str = "https://api.upstox.com"

    # --- Authentication / sessions -------------------------------------------------------
    session_cookie_name: str = "session"
    session_absolute_hours: int = 12  # hard expiry from login
    session_idle_minutes: int = 120  # expiry after this long without a request/heartbeat
    heartbeat_timeout_seconds: int = 90  # user is "online" only if heartbeat is this recent
    min_password_length: int = 12

    # Brute-force protection (database-backed; no Redis)
    login_max_failures: int = 5  # per username within the window
    login_ip_max_failures: int = 30  # per client IP within the window
    login_window_minutes: int = 15

    # --- Client IP / trusted proxies (see app/core/clientip.py and the README) ---------------
    # Number of TRUSTED reverse proxies in front of the app that each append the address they
    # saw to X-Forwarded-For. 0 (default) = never read forwarding headers (fail closed).
    trusted_proxy_hops: int = Field(default=0, ge=0, le=10)
    # Optional: only honour forwarding headers when the direct TCP peer is inside one of these
    # networks (JSON list, e.g. ["10.0.0.0/8"]). Empty = do not restrict by peer network.
    trusted_proxy_cidrs: list[str] = Field(default_factory=list)
    # Optional: only honour forwarding headers when the proxy sends this secret in X-Proxy-Secret.
    trusted_proxy_secret: str = ""

    # One-time bootstrap of the first Super Admin (python -m app.cli bootstrap-superadmin)
    bootstrap_superadmin_username: str = ""
    bootstrap_superadmin_email: str = ""
    bootstrap_superadmin_password: str = ""

    # --- Virtual (paper) wallet ----------------------------------------------------------
    # Simulated brokerage/charges as a fraction of turnover (0.0003 = 0.03%). VIRTUAL ONLY.
    paper_charge_rate: Decimal = Decimal("0.0003")

    @property
    def allowed_origins(self) -> set[str]:
        """Origins allowed to make state-changing requests (CSRF origin check)."""
        origins = {o.rstrip("/") for o in self.cors_origins}
        origins.add(self.frontend_url.rstrip("/"))
        return origins

    @property
    def database_configured(self) -> bool:
        return bool(self.database_url.strip())

    @property
    def upstox_configured(self) -> bool:
        return all(
            v.strip()
            for v in (
                self.upstox_client_id,
                self.upstox_client_secret,
                self.upstox_redirect_uri,
                self.upstox_token_encryption_key,
            )
        )


class ConfigurationError(RuntimeError):
    """Unsafe or incomplete configuration. Messages never include secret values."""


def assert_production_ready(settings: Settings) -> None:
    """Refuse to start in production with an unsafe Upstox configuration.

    Upstox is "enabled" as soon as ANY of its credentials is set. In production an enabled
    integration must be fully configured and bound to a single Upstox account
    (UPSTOX_ALLOWED_USER_ID); otherwise any Upstox user who authorizes the app could replace
    the stored market-data token. Raised outside Pydantic so the message cannot echo secrets.
    """
    if settings.app_env != "production":
        return
    fields = {
        "UPSTOX_CLIENT_ID": settings.upstox_client_id,
        "UPSTOX_CLIENT_SECRET": settings.upstox_client_secret,
        "UPSTOX_REDIRECT_URI": settings.upstox_redirect_uri,
        "UPSTOX_TOKEN_ENCRYPTION_KEY": settings.upstox_token_encryption_key,
        "UPSTOX_ALLOWED_USER_ID": settings.upstox_allowed_user_id,
    }
    if any(v.strip() for v in fields.values()):
        missing = [name for name, v in fields.items() if not v.strip()]
        if missing:
            raise ConfigurationError(
                "Refusing to start in production: the Upstox integration is partially configured. "
                f"Missing: {', '.join(missing)}. Set every Upstox variable (including "
                "UPSTOX_ALLOWED_USER_ID) or remove them all to disable Upstox."
            )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    assert_production_ready(settings)
    return settings
