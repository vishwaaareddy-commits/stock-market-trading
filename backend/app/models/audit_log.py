from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

JSONType = JSON().with_variant(JSONB(), "postgresql")


class AuditLog(Base):
    """Append-only record of security- and business-relevant actions.

    Never store passwords, tokens or secrets in `details` (see services.audit.sanitize).
    The actor's username is snapshotted so history stays readable if an account is removed.
    """

    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_created_at", "created_at"),
        Index("ix_audit_logs_actor_time", "actor_user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    actor_username: Mapped[str | None] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(48), index=True)
    resource_type: Mapped[str | None] = mapped_column(String(48))
    resource_id: Mapped[str | None] = mapped_column(String(64))
    details: Mapped[dict[str, Any] | None] = mapped_column(JSONType)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
