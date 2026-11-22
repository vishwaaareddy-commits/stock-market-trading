"""Audit trail helper. Callers commit; the entry is part of the caller's transaction so an
action and its audit record succeed or fail together."""

import re
from typing import Any

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.user import User

_SENSITIVE = re.compile(r"pass(word)?|token|secret|otp|hash|authorization|cookie|api[_-]?key", re.I)


def sanitize(details: dict[str, Any] | None) -> dict[str, Any] | None:
    """Drop anything that looks like a credential, recursively. Defence in depth: callers
    should never pass secrets in the first place."""
    if not details:
        return None

    def clean(value: Any) -> Any:
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items() if not _SENSITIVE.search(str(k))}
        if isinstance(value, list):
            return [clean(v) for v in value]
        if isinstance(value, (str, int, float, bool)) or value is None:
            return value
        return str(value)

    return clean(details)


def record(
    db: Session,
    action: str,
    *,
    actor: User | None = None,
    resource_type: str | None = None,
    resource_id: int | str | None = None,
    details: dict[str, Any] | None = None,
    ip: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        actor_user_id=actor.id if actor else None,
        actor_username=actor.username if actor else None,
        action=action,
        resource_type=resource_type,
        resource_id=str(resource_id) if resource_id is not None else None,
        details=sanitize(details),
        ip_address=ip,
    )
    db.add(entry)
    return entry
