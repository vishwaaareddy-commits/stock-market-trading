"""Virtual (paper) wallets. These balances are SIMULATED funds, not real money.

Invariants maintained by services.wallet (and asserted in tests):
  wallet.available_balance == SUM(wallet_transactions.amount)
  wallet.reserved_balance  == SUM(wallet_transactions.reserved_delta)
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import WalletTxType
from app.models.mixins import PRICE_PRECISION, TimestampMixin


class Wallet(TimestampMixin, Base):
    __tablename__ = "wallets"
    __table_args__ = (
        CheckConstraint("available_balance >= 0", name="available_non_negative"),
        CheckConstraint("reserved_balance >= 0", name="reserved_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), unique=True)
    available_balance: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION), default=Decimal("0"))
    reserved_balance: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION), default=Decimal("0"))
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION), default=Decimal("0"))


class WalletTransaction(Base):
    """Immutable ledger entry (updates and deletes are blocked in the ORM and, on
    PostgreSQL, by a database trigger)."""

    __tablename__ = "wallet_transactions"
    __table_args__ = (
        UniqueConstraint("wallet_id", "idempotency_key"),
        Index("ix_wallet_transactions_wallet_time", "wallet_id", "created_at"),
    )

    # `seq` gives a strict insertion order (entries in one transaction share created_at);
    # `id` is the public, globally unique transaction ID.
    seq: Mapped[int] = mapped_column(primary_key=True)
    id: Mapped[str] = mapped_column(String(36), unique=True, default=lambda: str(uuid.uuid4()))
    wallet_id: Mapped[int] = mapped_column(ForeignKey("wallets.id", ondelete="RESTRICT"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    type: Mapped[WalletTxType] = mapped_column(
        Enum(WalletTxType, name="wallet_tx_type", native_enum=False, length=24, create_constraint=True)
    )
    # Signed change to the available balance / to the reserved balance.
    amount: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION))
    reserved_delta: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION), default=Decimal("0"))
    available_before: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION))
    available_after: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION))
    reserved_before: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION))
    reserved_after: Mapped[Decimal] = mapped_column(Numeric(*PRICE_PRECISION))
    paper_order_id: Mapped[int | None] = mapped_column(ForeignKey("paper_orders.id", ondelete="RESTRICT"))
    paper_trade_id: Mapped[int | None] = mapped_column(ForeignKey("paper_trades.id", ondelete="RESTRICT"))
    description: Mapped[str] = mapped_column(String(500))
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    idempotency_key: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
