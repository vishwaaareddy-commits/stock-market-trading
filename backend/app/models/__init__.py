"""Import every model here so Alembic autogenerate sees the full metadata."""

from app.models.broker_connection import BrokerConnection
from app.models.candle import Candle
from app.models.instrument import Instrument
from app.models.paper_order import PaperOrder
from app.models.paper_trade import PaperTrade
from app.models.signal import Signal
from app.models.strategy import Strategy
from app.models.user import User

__all__ = [
    "BrokerConnection",
    "Candle",
    "Instrument",
    "PaperOrder",
    "PaperTrade",
    "Signal",
    "Strategy",
    "User",
]
