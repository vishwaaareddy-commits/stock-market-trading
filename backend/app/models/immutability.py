"""ORM-level guard making ledger and audit rows append-only.

PostgreSQL additionally enforces this with triggers (see Alembic migration 0003), which also
covers raw SQL. These listeners give the same guarantee in application code and in tests.
"""

from sqlalchemy import event

from app.models.audit_log import AuditLog
from app.models.wallet import WalletTransaction


class ImmutableRecordError(RuntimeError):
    pass


def _block_update(mapper, connection, target):
    raise ImmutableRecordError(f"{type(target).__name__} rows are append-only and cannot be updated")


def _block_delete(mapper, connection, target):
    raise ImmutableRecordError(f"{type(target).__name__} rows are append-only and cannot be deleted")


for _model in (WalletTransaction, AuditLog):
    event.listen(_model, "before_update", _block_update)
    event.listen(_model, "before_delete", _block_delete)
