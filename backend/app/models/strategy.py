from typing import Any

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import TimestampMixin


class Strategy(TimestampMixin, Base):
    """A configured instance of a strategy type (e.g. ema_crossover, 12/30, 15m).

    `strategy_type` matches a key in the strategy registry (app/strategies) and
    `params` holds that strategy's parameters, so new strategies need no schema change.
    """

    __tablename__ = "strategies"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    strategy_type: Mapped[str] = mapped_column(String(64), index=True)
    timeframe: Mapped[str] = mapped_column(String(16), default="15m")
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship(back_populates="strategies")  # noqa: F821
    signals: Mapped[list["Signal"]] = relationship(back_populates="strategy")  # noqa: F821
