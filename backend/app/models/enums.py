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
