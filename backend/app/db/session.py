from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


class DatabaseNotConfiguredError(RuntimeError):
    pass


@lru_cache
def get_engine() -> Engine:
    """Create the engine lazily so the API can boot without a database."""
    settings = get_settings()
    if not settings.database_configured:
        raise DatabaseNotConfiguredError("DATABASE_URL is not set")
    return create_engine(settings.database_url, pool_pre_ping=True)


@lru_cache
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a database session."""
    with get_session_factory()() as session:
        yield session
