import pandas as pd
import pytest

from app.models.enums import SignalAction
from app.strategies import (
    BaseStrategy,
    StrategyDecision,
    get_strategy_class,
    register_strategy,
    registered_strategies,
)


def test_register_and_lookup():
    @register_strategy("dummy_test")
    class Dummy(BaseStrategy):
        def evaluate(self, candles: pd.DataFrame, has_open_position: bool):
            return StrategyDecision(SignalAction.HOLD)

    assert "dummy_test" in registered_strategies()
    assert get_strategy_class("dummy_test") is Dummy
    assert Dummy().evaluate(pd.DataFrame(), False).action is SignalAction.HOLD

    with pytest.raises(ValueError):
        register_strategy("dummy_test")(Dummy)


def test_unknown_strategy():
    with pytest.raises(KeyError):
        get_strategy_class("nope")
