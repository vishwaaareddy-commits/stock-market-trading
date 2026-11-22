from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import OrderSide, OrderStatus
from app.models.mixins import PRICE_PRECISION


class PaperOrder(Base):
    """A simulated order. Never sent to a broker."""

    __tablename__ = "paper_orders"
    __table_args__ = (UniqueConstraint("user_id", "idempotency_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    strategy_id: Mapped[int | None] = mapped_column(
        ForeignKey("strategies.id", ondelete="SET NULL")
    )
    signal_id: Mapped[int | None] = mapped_column(
        ForeignKey("signals.id", ondelete="SET NULL")
    )
    instrument_id: Mapped[int] = mapped_column(
        ForeignKey("instruments.id", ondelete="CASCADE"), index=True
    )
    side: Mapped[OrderSide] = mapped_column(Enum(OrderSide, name="order_side"))
    quantity: Mapped[int] = mapped_column(Integer)
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status"), default=OrderStatus.PENDING
    )
    fill_price: Mapped[Decimal | None] = mapped_column(Numeric(*PRICE_PRECISION))
    filled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Limit price the order was placed at (BUY fills at or below it, SELL at or above it).
    limit_price: Mapped[Decimal | None] = mapped_column(Numeric(*PRICE_PRECISION))
    # Virtual funds currently held for a pending BUY (released on cancel/reject/fill).
    reserved_amount: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION), default=Decimal("0"))
    charges: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION), default=Decimal("0"))
    # Client-supplied key; a repeated request with the same key returns the same order.
    idempotency_key: Mapped[str | None] = mapped_column(String(64))
    status_reason: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), onupdate=func.now())
