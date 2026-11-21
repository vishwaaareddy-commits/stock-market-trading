# Architecture

## Layout

```
backend/
  app/
    main.py            FastAPI app factory
    core/config.py     Settings (env vars / backend/.env)
    api/               Routers (api/router.py aggregates api/routes/*)
    db/                Declarative Base, lazy engine + session dependency
    models/            SQLAlchemy 2.x models
    strategies/        Strategy plug-in contract + registry (no strategies yet)
  alembic/             Migrations (env.py reads DATABASE_URL, never alembic.ini)
  tests/               pytest
frontend/              Next.js App Router dashboard (mock data clearly labelled)
database/              Reserved for SQL scripts / notes
```

## Data model

`users` → `strategies` (type + JSONB params + timeframe) → `signals` (one per strategy, instrument and candle)
→ `paper_orders` → `paper_trades` (an OPEN trade is an open paper position). `instruments` and `candles`
hold NSE market data (`unique(instrument_id, timeframe, open_time)`).

`signals` has `UNIQUE(strategy_id, instrument_id, candle_time)`, so a duplicate signal for the same
candle is rejected by the database. Strategy code should additionally check before inserting.

## Adding a strategy

1. Create `backend/app/strategies/<name>.py`, subclass `BaseStrategy`, decorate with `@register_strategy("<name>")`.
2. Implement `evaluate(candles, has_open_position) -> StrategyDecision`. It must be pure (no DB, no orders).
3. Insert a `strategies` row with `strategy_type="<name>"` and its params.

## Planned first strategy (not implemented)

EMA 12 / EMA 30 crossover, NSE, 15m candles, paper only, long only:
BUY when EMA12 crosses above EMA30 on a completed candle; SELL when it crosses below and a paper position
is open; otherwise HOLD. One signal per candle.

## Safety

Paper trading only. No broker SDKs, no live order path. `TRADING_MODE` accepts only `paper`.
