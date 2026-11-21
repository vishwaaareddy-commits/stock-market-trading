# database

Schema is managed by Alembic (`backend/alembic`). This folder is reserved for optional SQL scripts and notes.
Create a local/dev PostgreSQL database, set `DATABASE_URL` in `backend/.env`, then run `npm run migrate` in `backend/`.
