from sqlalchemy import UniqueConstraint

import app.models  # noqa: F401  (registers tables)
from app.db.base import Base


def test_expected_tables_registered():
    assert set(Base.metadata.tables) == {
        "users",
        "strategies",
        "instruments",
        "candles",
        "signals",
        "paper_orders",
        "paper_trades",
        "broker_connections",
        "auth_sessions",
        "login_attempts",
        "audit_logs",
        "wallets",
        "wallet_transactions",
    }


def _unique_cols(table):
    return [
        tuple(c.name for c in con.columns)
        for con in Base.metadata.tables[table].constraints
        if isinstance(con, UniqueConstraint)
    ]


def test_signal_unique_per_candle():
    assert ("strategy_id", "instrument_id", "candle_time") in _unique_cols("signals")


def test_candle_unique_per_bar():
    assert ("instrument_id", "timeframe", "open_time") in _unique_cols("candles")
