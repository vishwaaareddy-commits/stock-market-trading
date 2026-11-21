from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import PRICE_PRECISION


class Candle(Base):
    """OHLCV bar. `open_time` is the bar's start; only completed bars should be stored."""

    __tablename__ = "candles"
    __table_args__ = (UniqueConstraint("instrument_id", "timeframe", "open_time"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    instrument_id: Mapped[int] = mapped_column(
        ForeignKey("instruments.id", ondelete="CASCADE"), index=True
    )
    timeframe: Mapped[str] = mapped_column(String(16))  # e.g. 15m
    open_time: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    open: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION))
    high: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION))
    low: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION))
    close: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION))
    volume: Mapped[int] = mapped_column(BigInteger, default=0)
    source: Mapped[str | None] = mapped_column(String(32))  # data provider name
