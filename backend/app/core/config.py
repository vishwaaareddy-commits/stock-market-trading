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


@lru_cache
def get_settings() -> Settings:
    return Settings()
