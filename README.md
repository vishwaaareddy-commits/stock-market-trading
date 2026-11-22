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

## Authentication, roles and virtual wallets

There is **no public registration**. Two roles exist: `SUPER_ADMIN` and `ADMIN`. Every permission is
enforced by the backend on every request; the frontend only hides links for convenience.

**First Super Admin (one time):** set `BOOTSTRAP_SUPERADMIN_USERNAME`, `_EMAIL` and `_PASSWORD` in
`backend/.env` (or the host's environment), run `npm run bootstrap:superadmin` in `backend/`, then remove
the password. The command refuses to run again once a Super Admin exists, so it cannot add or promote users.

Sign-in uses Argon2id password hashes and an HttpOnly, SameSite=Lax session cookie (Secure in production).
The browser calls the API through a same-origin Next.js proxy (`/api/v1/*`, see `BACKEND_ORIGIN` in
`frontend/.env.example`) so the cookie stays first-party. Login is rate limited per account and per IP.

| Who | Can |
|---|---|
| Super Admin | Create/deactivate/reactivate/soft-delete Admins, reset passwords, revoke sessions, recharge or deduct virtual funds (reason required), see all wallets/orders/trades/audit log, and paper trade with their own wallet |
| Admin | Use the dashboard and paper trading with their own wallet, see only their own orders, trades, positions and ledger, change their own password |

**Wallets are VIRTUAL.** Balances are simulated funds, never real money; no bank or broker is involved.
Every change is an immutable ledger entry (update/delete is blocked in the ORM and by PostgreSQL triggers),
and balances always equal the sum of the ledger. Orders and admin adjustments are idempotent
(`Idempotency-Key` header) and run in single transactions, so retries or double-clicks cannot double-apply.
Replaying a key with the **same** details returns the original result; reusing it with **different**
details returns `409 idempotency_conflict`. Soft-deleting an account cancels its pending orders and releases
their reserved funds (immutable ledger entries, same transaction); orders and trades are kept.

### Client IP and login throttling behind Vercel → Render

`X-Forwarded-For` is client-controllable, so it is **never trusted by default** (`TRUSTED_PROXY_HOPS=0`).
Each trusted proxy appends the address it saw on the right, so with N trusted proxies the client is the
N-th entry from the right; entries to its left are ignored. Malformed or too-short chains fail closed.

- Vercel overwrites `x-forwarded-for` with the true client IP (it does not forward external values). The Render
  service is fronted by Cloudflare and Render's own proxy, which each append an entry. The exact number cannot
  be verified from outside, so measure it: sign in as Super Admin via the real frontend, call
  `GET /api/v1/admin/diagnostics/client-ip`, count from the right to your own public IP, and set `TRUSTED_PROXY_HOPS`.
- While `TRUSTED_PROXY_HOPS=0` behind a platform proxy the peer is a private proxy address, so **per-IP throttling is
  inactive** (and never pools all users into one bucket); **per-account throttling always applies.**
- Residual risk: a request that reaches Render *directly* (bypassing Vercel) has a shorter chain and could carry a
  crafted header. Add `TRUSTED_PROXY_SECRET` (the proxy must send it as `X-Proxy-Secret`) and/or `TRUSTED_PROXY_CIDRS`
  so the header is only honoured for requests that provably came through your proxy.

### Production startup checks

With `APP_ENV=production` the API (and `alembic`/CLI commands, which load the same settings) **refuses to start** if the
Upstox integration is enabled (any `UPSTOX_*` credential set) but incomplete, in particular without
`UPSTOX_ALLOWED_USER_ID`. Leaving every Upstox variable empty disables the integration and is allowed.

Apply the schema with `npm run migrate` (migration `0003`) against a **development** database first.

## Upstox market data (read-only)

OAuth runs entirely on the backend; the client secret and tokens never reach the browser. The access
token is encrypted (Fernet) and stored in the `broker_connections` table, so restarts keep it.
Upstox tokens expire daily at ~03:30 IST, so reconnect each trading day.

Backend env vars: `UPSTOX_CLIENT_ID`, `UPSTOX_CLIENT_SECRET`, `UPSTOX_REDIRECT_URI`
(must equal the URL registered with Upstox), `UPSTOX_TOKEN_ENCRYPTION_KEY` (`npm run generate:key`),
`UPSTOX_ALLOWED_USER_ID` (**mandatory in production**), `FRONTEND_URL`. Also requires `DATABASE_URL` and `npm run migrate`.

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
