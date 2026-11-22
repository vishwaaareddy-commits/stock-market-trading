from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import TradeStatus
from app.models.mixins import PRICE_PRECISION


class PaperTrade(Base):
    """A long-only round trip. An OPEN trade is an open paper position."""

    __tablename__ = "paper_trades"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    strategy_id: Mapped[int | None] = mapped_column(
        ForeignKey("strategies.id", ondelete="SET NULL")
    )
    instrument_id: Mapped[int] = mapped_column(
        ForeignKey("instruments.id", ondelete="CASCADE"), index=True
    )
    entry_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("paper_orders.id", ondelete="SET NULL")
    )
    exit_order_id: Mapped[int | None] = mapped_column(
        ForeignKey("paper_orders.id", ondelete="SET NULL")
    )
    quantity: Mapped[int] = mapped_column(Integer)
    entry_price: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION))
    exit_price: Mapped[Decimal | None] = mapped_column(Numeric(*PRICE_PRECISION))
    status: Mapped[TradeStatus] = mapped_column(
        Enum(TradeStatus, name="trade_status"), default=TradeStatus.OPEN
    )
    entry_charge: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION), default=Decimal("0"))
    exit_charge: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION), default=Decimal("0"))
    pnl: Mapped[Decimal | None] = mapped_column(Numeric(*PRICE_PRECISION))
    opened_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
