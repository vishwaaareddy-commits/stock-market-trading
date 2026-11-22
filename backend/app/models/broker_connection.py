from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


class BrokerConnection(TimestampMixin, Base):
    """Encrypted market-data provider credentials. One row per provider (e.g. "upstox").

    Only the encrypted access token is stored; it is never returned by any API.
    """

    __tablename__ = "broker_connections"

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(32), unique=True)
    encrypted_access_token: Mapped[str] = mapped_column(Text)
    provider_user_id: Mapped[str | None] = mapped_column(String(64))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
