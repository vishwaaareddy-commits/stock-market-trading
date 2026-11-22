"""Request/response models. Responses deliberately omit password hashes and token hashes.
Decimals serialise as strings so money never passes through binary floating point."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import OrderSide, OrderStatus, TradeStatus, UserRole, WalletTxType

Money = Decimal


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- auth -------------------------------------------------------------------------------
class LoginIn(BaseModel):
    identifier: str = Field(min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=256)


class UserOut(ORM):
    id: int
    username: str
    email: str
    display_name: str | None
    role: UserRole
    is_active: bool
    must_change_password: bool
    created_at: datetime
    last_login_at: datetime | None


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=1, max_length=256)


PageName = Literal[
    "overview", "strategies", "market-data", "signals", "paper-trading", "backtesting", "settings",
    "wallet", "reports", "admin-dashboard", "admin-users", "admin-wallets", "admin-audit",
]


class PageViewIn(BaseModel):
    page: PageName


# --- admin management -------------------------------------------------------------------
class AdminCreateIn(BaseModel):
    username: str = Field(max_length=64)
    email: str = Field(max_length=320)
    display_name: str | None = Field(default=None, max_length=120)
    password: str | None = Field(default=None, max_length=256, description="Omit to generate a temporary password")
    initial_balance: Decimal = Field(default=Decimal("0"), ge=0, max_digits=18, decimal_places=2)


class AdminUpdateIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    email: str | None = Field(default=None, max_length=320)


class PasswordResetIn(BaseModel):
    password: str | None = Field(default=None, max_length=256, description="Omit to generate a temporary password")


class AdminRow(ORM):
    id: int
    username: str
    email: str
    display_name: str | None
    role: UserRole
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None
    last_activity_at: datetime | None
    last_heartbeat_at: datetime | None
    deleted_at: datetime | None
    online: bool = False
    active_sessions: int = 0
    available_balance: Money | None = None
    reserved_balance: Money | None = None


class SessionOut(ORM):
    id: int
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    ip_address: str | None
    user_agent: str | None


class CredentialOut(BaseModel):
    user: AdminRow
    temporary_password: str | None = Field(default=None, description="Shown once; never stored in clear text")


# --- wallet -----------------------------------------------------------------------------
class WalletAdjustIn(BaseModel):
    kind: Literal["RECHARGE", "DEDUCT"]
    amount: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    reason: str = Field(min_length=3, max_length=500)


class WalletOut(BaseModel):
    currency: str
    is_virtual: bool
    available_balance: Money
    reserved_balance: Money
    invested_cost: Money
    realized_pnl: Money
    unrealized_pnl: Money | None
    total_equity: Money
    equity_basis: str


class WalletTxOut(ORM):
    id: str
    type: WalletTxType
    amount: Money
    reserved_delta: Money
    available_before: Money
    available_after: Money
    reserved_before: Money
    reserved_after: Money
    paper_order_id: int | None
    paper_trade_id: int | None
    description: str
    actor_user_id: int | None
    created_at: datetime


class WalletRow(BaseModel):
    user_id: int
    username: str
    role: UserRole
    is_active: bool
    deleted: bool
    available_balance: Money
    reserved_balance: Money
    realized_pnl: Money


# --- paper trading ----------------------------------------------------------------------
class OrderIn(BaseModel):
    instrument_id: int = Field(gt=0)
    side: OrderSide
    quantity: int = Field(gt=0, le=1_000_000)
    limit_price: Decimal = Field(gt=0, max_digits=18, decimal_places=2)
    strategy_id: int | None = None


class OrderOut(ORM):
    id: int
    instrument_id: int
    side: OrderSide
    quantity: int
    status: OrderStatus
    limit_price: Money | None
    fill_price: Money | None
    reserved_amount: Money
    charges: Money
    status_reason: str | None
    created_at: datetime
    filled_at: datetime | None


class TradeOut(ORM):
    id: int
    instrument_id: int
    quantity: int
    entry_price: Money
    exit_price: Money | None
    status: TradeStatus
    pnl: Money | None
    entry_charge: Money
    exit_charge: Money
    opened_at: datetime
    closed_at: datetime | None


class PositionOut(BaseModel):
    instrument_id: int
    symbol: str
    quantity: int
    avg_entry_price: Money
    cost_basis: Money
    last_price: Money | None
    unrealized_pnl: Money | None


class InstrumentOut(ORM):
    id: int
    symbol: str
    exchange: str
    name: str | None


class AuditOut(ORM):
    id: int
    actor_user_id: int | None
    actor_username: str | None
    action: str
    resource_type: str | None
    resource_id: str | None
    details: dict[str, Any] | None
    created_at: datetime
