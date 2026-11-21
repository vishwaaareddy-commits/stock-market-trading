from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import OrderSide, OrderStatus
from app.models.mixins import PRICE_PRECISION


class PaperOrder(Base):
    """A simulated order. Never sent to a broker."""

    __tablename__ = "paper_orders"

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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
