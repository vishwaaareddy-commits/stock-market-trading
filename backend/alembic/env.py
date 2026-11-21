from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

import app.models  # noqa: F401  (registers all tables on Base.metadata)
from app.core.config import get_settings
from app.db.base import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    url = get_settings().database_url.strip()
    if not url:
        raise SystemExit(
            "DATABASE_URL is not set. Copy backend/.env.example to backend/.env "
            "and point it at a local/dev PostgreSQL database."
        )
    return url


def run_migrations_offline() -> None:
    """Emit SQL without connecting. Falls back to a PostgreSQL dialect if no URL is set."""
    url = get_settings().database_url.strip() or "postgresql+psycopg://"
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(_database_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata, compare_type=True
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
