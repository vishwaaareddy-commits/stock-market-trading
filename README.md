# Stock Market Trading System

Paper-trading platform for NSE stocks. **No live trading, no broker orders, no real money.**
Planned first strategy: EMA 12 / EMA 30 crossover on 15-minute candles (not implemented yet; see
[docs/architecture.md](docs/architecture.md)).

- `frontend/` Next.js 16 + TypeScript + Tailwind dashboard
- `backend/` FastAPI + SQLAlchemy 2 + Alembic + PostgreSQL
- `database/`, `docs/` supporting files

Redis and Celery are intentionally not used at this stage.

## Prerequisites

Node.js 20+, Python 3.12, and (for database features) a **local/dev** PostgreSQL.

## First-time setup

```bash
# frontend
cd frontend
npm install
copy .env.example .env.local        # optional (macOS/Linux: cp)

# backend (the .venv already exists; recreate with `python -m venv .venv` if needed)
cd backend
npm run install:deps                # pip install -r requirements.txt into .venv
copy .env.example .env              # then set DATABASE_URL (macOS/Linux: cp)
```

`DATABASE_URL` format: `postgresql+psycopg://USER:PASSWORD@localhost:5432/trading_dev`.
Never commit `.env`. The API starts without a database; only DB-dependent features need it.

## Run

| Terminal | Commands | URL |
|---|---|---|
| Frontend | `cd frontend` then `npm run dev` | http://localhost:3000 |
| Backend | `cd backend` then `npm run dev` | http://127.0.0.1:8000 (docs at `/docs`) |

Health checks: `GET /api/v1/health` (liveness) and `GET /api/v1/health/db` (PostgreSQL connectivity;
returns 503 `not_configured` until `DATABASE_URL` is set).

## Backend commands (run in `backend/`)

| Command | What it does |
|---|---|
| `npm run dev` | Uvicorn with reload, using `.venv` Python |
| `npm start` | Uvicorn without reload |
| `npm test` | pytest |
| `npm run migrate` | `alembic upgrade head` (applies to the DB in `DATABASE_URL`) |
| `npm run migrate:status` | Show current DB revision |
| `npm run migrate:history` | List all revisions |
| `npm run migrate:sql` | Print migration SQL without touching a DB |
| `npm run migrate:new -- "message"` | Autogenerate a new migration (needs a DB at the current head) |
| `npm run migrate:down` | Roll back one revision |
| `npm run install:deps` | Install `requirements.txt` into `.venv` |

Only point `DATABASE_URL` at a local or development database when running migrations.

## Upstox market data (read-only)

OAuth runs entirely on the backend; the client secret and tokens never reach the browser. The access
token is encrypted (Fernet) and stored in the `broker_connections` table, so restarts keep it.
Upstox tokens expire daily at ~03:30 IST, so reconnect each trading day.

Backend env vars: `UPSTOX_CLIENT_ID`, `UPSTOX_CLIENT_SECRET`, `UPSTOX_REDIRECT_URI`
(must equal the URL registered with Upstox), `UPSTOX_TOKEN_ENCRYPTION_KEY` (`npm run generate:key`),
optional `UPSTOX_ALLOWED_USER_ID`, `FRONTEND_URL`. Also requires `DATABASE_URL` and `npm run migrate`.

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/auth/upstox/login` | Open in a browser to start the login |
| `GET /api/v1/auth/upstox/callback` | Registered redirect URL (Upstox calls it) |
| `GET /api/v1/auth/upstox/status[?verify=true]` | Connection status for the frontend |
| `GET /api/v1/market-data/upstox/test` | Fetches recent 15m candles; returns a summary only |

Read-only: no order, fund or portfolio endpoints exist. Trading stays paper-only.

## Frontend commands (run in `frontend/`)

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test`

## Mock data

Placeholder content lives only in `frontend/lib/mock-data.ts`. Every page that uses it shows a
**MOCK DATA** badge/notice. Symbols are fictional (`SAMPLE1`…) and prices are not real quotes.

## Windows note

If `npm test` in `frontend/` fails with "Cannot find native binding", run `npm install` again
(the Windows rolldown binding is declared as an optional dependency).
