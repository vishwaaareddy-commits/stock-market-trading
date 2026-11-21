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

## Frontend commands (run in `frontend/`)

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm test`

## Mock data

Placeholder content lives only in `frontend/lib/mock-data.ts`. Every page that uses it shows a
**MOCK DATA** badge/notice. Symbols are fictional (`SAMPLE1`…) and prices are not real quotes.

## Windows note

If `npm test` in `frontend/` fails with "Cannot find native binding", run `npm install` again
(the Windows rolldown binding is declared as an optional dependency).
