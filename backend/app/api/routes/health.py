from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import get_engine

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def health() -> dict[str, str]:
    """Liveness check. Does not touch the database."""
    settings = get_settings()
    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.app_env,
        "trading_mode": settings.trading_mode,
    }


@router.get("/db")
def health_db(response: Response) -> dict[str, str]:
    """Readiness check for PostgreSQL connectivity."""
    if not get_settings().database_configured:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "not_configured", "detail": "DATABASE_URL is not set"}
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:  # report the class only; never leak connection strings
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unavailable", "detail": type(exc).__name__}
    return {"status": "ok"}
