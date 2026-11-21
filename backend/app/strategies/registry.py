from collections.abc import Callable

from app.strategies.base import BaseStrategy

_REGISTRY: dict[str, type[BaseStrategy]] = {}


def register_strategy(name: str) -> Callable[[type[BaseStrategy]], type[BaseStrategy]]:
    def decorator(cls: type[BaseStrategy]) -> type[BaseStrategy]:
        if name in _REGISTRY:
            raise ValueError(f"Strategy '{name}' is already registered")
        cls.name = name
        _REGISTRY[name] = cls
        return cls

    return decorator


def get_strategy_class(name: str) -> type[BaseStrategy]:
    try:
        return _REGISTRY[name]
    except KeyError:
        raise KeyError(f"Unknown strategy '{name}'") from None


def registered_strategies() -> list[str]:
    return sorted(_REGISTRY)
