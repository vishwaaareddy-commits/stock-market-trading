"""Strategy plug-in contract. No strategy logic is implemented yet.

Each strategy lives in its own module (e.g. app/strategies/ema_crossover.py),
subclasses BaseStrategy and registers itself with @register_strategy("name").
Strategies are pure: candles in, decision out. They never touch the database
or place orders, so paper trading and backtesting can share them.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from app.models.enums import SignalAction


@dataclass(frozen=True)
class StrategyDecision:
    action: SignalAction
    indicators: dict[str, Any] = field(default_factory=dict)


class BaseStrategy(ABC):
    name: str  # registry key, set by @register_strategy

    def __init__(self, params: dict[str, Any] | None = None) -> None:
        self.params = params or {}

    @abstractmethod
    def evaluate(self, candles: pd.DataFrame, has_open_position: bool) -> StrategyDecision:
        """Decide on the last row of `candles`, which must be a completed candle.

        Columns: open_time, open, high, low, close, volume. Long-only: SELL may
        only be returned when `has_open_position` is True.
        """
