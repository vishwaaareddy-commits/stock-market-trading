import enum


class SignalAction(str, enum.Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"


class OrderSide(str, enum.Enum):
    BUY = "BUY"
    SELL = "SELL"  # closes a long position; short selling is not supported


class OrderStatus(str, enum.Enum):
    PENDING = "PENDING"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"


class TradeStatus(str, enum.Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"


class WalletTxType(str, enum.Enum):
    INITIAL_CREDIT = "INITIAL_CREDIT"
    ADMIN_RECHARGE = "ADMIN_RECHARGE"
    ADMIN_ADJUSTMENT = "ADMIN_ADJUSTMENT"
    TRADE_BUY = "TRADE_BUY"
    TRADE_SELL = "TRADE_SELL"
    TRADE_CHARGE = "TRADE_CHARGE"
    TRADE_REFUND = "TRADE_REFUND"
