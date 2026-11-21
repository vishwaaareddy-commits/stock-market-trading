from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import SignalAction
from app.models.mixins import PRICE_PRECISION


class Signal(Base):
    """A strategy decision for one completed candle.

    The unique constraint allows at most one signal per strategy, instrument
    and candle, which prevents duplicate signals at the database level.
    """

    __tablename__ = "signals"
    __table_args__ = (UniqueConstraint("strategy_id", "instrument_id", "candle_time"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    strategy_id: Mapped[int] = mapped_column(
        ForeignKey("strategies.id", ondelete="CASCADE"), index=True
    )
    instrument_id: Mapped[int] = mapped_column(
        ForeignKey("instruments.id", ondelete="CASCADE"), index=True
    )
    timeframe: Mapped[str] = mapped_column(String(16))
    candle_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    action: Mapped[SignalAction] = mapped_column(Enum(SignalAction, name="signal_action"))
    price: Mapped[Decimal | None] = mapped_column(Numeric(*PRICE_PRECISION))
    indicators: Mapped[dict[str, Any] | None] = mapped_column(JSONB)  # e.g. ema_12, ema_30
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    strategy: Mapped["Strategy"] = relationship(back_populates="signals")  # noqa: F821
