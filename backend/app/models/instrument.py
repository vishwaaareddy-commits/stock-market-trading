from sqlalchemy import Boolean, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import TimestampMixin


class Instrument(TimestampMixin, Base):
    __tablename__ = "instruments"
    __table_args__ = (UniqueConstraint("exchange", "symbol"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32))  # e.g. RELIANCE
    exchange: Mapped[str] = mapped_column(String(16), default="NSE")
    name: Mapped[str | None] = mapped_column(String(200))
    instrument_type: Mapped[str] = mapped_column(String(16), default="EQ")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
