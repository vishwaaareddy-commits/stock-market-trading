from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LoginAttempt(Base):
    """Used for database-backed brute-force throttling. Stores no passwords."""

    __tablename__ = "login_attempts"
    __table_args__ = (
        Index("ix_login_attempts_identifier_time", "identifier", "created_at"),
        Index("ix_login_attempts_ip_time", "ip_address", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    identifier: Mapped[str] = mapped_column(String(320))  # lower-cased username/email as typed
    ip_address: Mapped[str | None] = mapped_column(String(64))
    success: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
