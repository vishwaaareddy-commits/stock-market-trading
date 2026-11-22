"""Import every model here so Alembic autogenerate sees the full metadata."""

from app.models.audit_log import AuditLog
from app.models.auth_session import AuthSession
from app.models.broker_connection import BrokerConnection
from app.models.candle import Candle
from app.models.instrument import Instrument
from app.models.login_attempt import LoginAttempt
from app.models.paper_order import PaperOrder
from app.models.paper_trade import PaperTrade
from app.models.signal import Signal
from app.models.strategy import Strategy
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.models import immutability as _immutability  # noqa: F401  (registers append-only guards)

__all__ = [
    "AuditLog",
    "AuthSession",
    "BrokerConnection",
    "Candle",
    "Instrument",
    "LoginAttempt",
    "PaperOrder",
    "PaperTrade",
    "Signal",
    "Strategy",
    "User",
    "Wallet",
    "WalletTransaction",
]
