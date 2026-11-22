"""auth, sessions, virtual wallets, immutable ledger and audit log

Additive and data-safe: existing users, instruments, strategies, signals, candles, paper orders
and trades are kept. New NOT NULL columns on existing tables get defaults/backfills first.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-23
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NOW = sa.text("now()")
MONEY = sa.Numeric(18, 4)


def upgrade() -> None:
    # ---- users: roles, credentials metadata, presence, soft delete --------------------
    op.add_column("users", sa.Column("username", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("role", sa.String(20), nullable=False, server_default="ADMIN"))
    op.add_column("users", sa.Column("must_change_password", sa.Boolean(), nullable=False, server_default=sa.false()))
    for col in ("password_changed_at", "last_login_at", "last_activity_at", "last_heartbeat_at", "deleted_at"):
        op.add_column("users", sa.Column(col, sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("created_by_id", sa.Integer(), nullable=True))
    # Backfill for any pre-existing rows, then enforce NOT NULL.
    op.execute("UPDATE users SET username = 'user' || id WHERE username IS NULL")
    op.execute("UPDATE users SET email = lower(email)")
    op.alter_column("users", "username", existing_type=sa.String(64), nullable=False)
    op.create_unique_constraint(op.f("uq_users_username"), "users", ["username"])
    op.create_check_constraint(op.f("ck_users_user_role"), "users", "role IN ('SUPER_ADMIN', 'ADMIN')")
    op.create_foreign_key(op.f("fk_users_created_by_id_users"), "users", "users", ["created_by_id"], ["id"], ondelete="SET NULL")

    # ---- paper orders / trades: wallet integration columns ----------------------------
    op.add_column("paper_orders", sa.Column("limit_price", MONEY, nullable=True))
    op.add_column("paper_orders", sa.Column("reserved_amount", MONEY, nullable=False, server_default="0"))
    op.add_column("paper_orders", sa.Column("charges", MONEY, nullable=False, server_default="0"))
    op.add_column("paper_orders", sa.Column("idempotency_key", sa.String(64), nullable=True))
    op.add_column("paper_orders", sa.Column("status_reason", sa.String(255), nullable=True))
    op.add_column("paper_orders", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint(op.f("uq_paper_orders_user_id"), "paper_orders", ["user_id", "idempotency_key"])
    op.add_column("paper_trades", sa.Column("entry_charge", MONEY, nullable=False, server_default="0"))
    op.add_column("paper_trades", sa.Column("exit_charge", MONEY, nullable=False, server_default="0"))

    # ---- sessions & login throttling --------------------------------------------------
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_reason", sa.String(64), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_auth_sessions_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auth_sessions")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_auth_sessions_token_hash")),
    )
    op.create_index("ix_auth_sessions_user_active", "auth_sessions", ["user_id", "revoked_at"])

    op.create_table(
        "login_attempts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("identifier", sa.String(320), nullable=False),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_login_attempts")),
    )
    op.create_index("ix_login_attempts_identifier_time", "login_attempts", ["identifier", "created_at"])
    op.create_index("ix_login_attempts_ip_time", "login_attempts", ["ip_address", "created_at"])

    # ---- audit log --------------------------------------------------------------------
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("actor_username", sa.String(64), nullable=True),
        sa.Column("action", sa.String(48), nullable=False),
        sa.Column("resource_type", sa.String(48), nullable=True),
        sa.Column("resource_id", sa.String(64), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], name=op.f("fk_audit_logs_actor_user_id_users"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
    )
    op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])
    op.create_index("ix_audit_logs_actor_time", "audit_logs", ["actor_user_id", "created_at"])

    # ---- wallets & ledger -------------------------------------------------------------
    op.create_table(
        "wallets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("available_balance", MONEY, nullable=False),
        sa.Column("reserved_balance", MONEY, nullable=False),
        sa.Column("realized_pnl", MONEY, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.CheckConstraint("available_balance >= 0", name=op.f("ck_wallets_available_non_negative")),
        sa.CheckConstraint("reserved_balance >= 0", name=op.f("ck_wallets_reserved_non_negative")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_wallets_user_id_users"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_wallets")),
        sa.UniqueConstraint("user_id", name=op.f("uq_wallets_user_id")),
    )
    op.create_table(
        "wallet_transactions",
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("wallet_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("type", sa.String(24), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("reserved_delta", MONEY, nullable=False),
        sa.Column("available_before", MONEY, nullable=False),
        sa.Column("available_after", MONEY, nullable=False),
        sa.Column("reserved_before", MONEY, nullable=False),
        sa.Column("reserved_after", MONEY, nullable=False),
        sa.Column("paper_order_id", sa.Integer(), nullable=True),
        sa.Column("paper_trade_id", sa.Integer(), nullable=True),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("idempotency_key", sa.String(64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW, nullable=False),
        sa.CheckConstraint(
            "type IN ('INITIAL_CREDIT','ADMIN_RECHARGE','ADMIN_ADJUSTMENT','TRADE_BUY','TRADE_SELL','TRADE_CHARGE','TRADE_REFUND')",
            name=op.f("ck_wallet_transactions_wallet_tx_type"),
        ),
        sa.ForeignKeyConstraint(["wallet_id"], ["wallets.id"], name=op.f("fk_wallet_transactions_wallet_id_wallets"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_wallet_transactions_user_id_users"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["paper_order_id"], ["paper_orders.id"], name=op.f("fk_wallet_transactions_paper_order_id_paper_orders"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["paper_trade_id"], ["paper_trades.id"], name=op.f("fk_wallet_transactions_paper_trade_id_paper_trades"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], name=op.f("fk_wallet_transactions_actor_user_id_users"), ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("seq", name=op.f("pk_wallet_transactions")),
        sa.UniqueConstraint("id", name=op.f("uq_wallet_transactions_id")),
        sa.UniqueConstraint("wallet_id", "idempotency_key", name=op.f("uq_wallet_transactions_wallet_id")),
    )
    op.create_index(op.f("ix_wallet_transactions_user_id"), "wallet_transactions", ["user_id"])
    op.create_index("ix_wallet_transactions_wallet_time", "wallet_transactions", ["wallet_id", "created_at"])

    # ---- append-only enforcement (also blocks raw SQL) --------------------------------
    op.execute(
        """
        CREATE FUNCTION forbid_row_mutation() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    for table in ("wallet_transactions", "audit_logs"):
        op.execute(
            f"CREATE TRIGGER {table}_append_only BEFORE UPDATE OR DELETE ON {table} "
            f"FOR EACH ROW EXECUTE FUNCTION forbid_row_mutation()"
        )


def downgrade() -> None:
    # NOTE: downgrading destroys wallet ledger and audit history. Take a backup first.
    for table in ("wallet_transactions", "audit_logs"):
        op.execute(f"DROP TRIGGER IF EXISTS {table}_append_only ON {table}")
    op.execute("DROP FUNCTION IF EXISTS forbid_row_mutation()")
    op.drop_table("wallet_transactions")
    op.drop_table("wallets")
    op.drop_table("audit_logs")
    op.drop_table("login_attempts")
    op.drop_table("auth_sessions")
    op.drop_column("paper_trades", "exit_charge")
    op.drop_column("paper_trades", "entry_charge")
    op.drop_constraint(op.f("uq_paper_orders_user_id"), "paper_orders", type_="unique")
    for col in ("updated_at", "status_reason", "idempotency_key", "charges", "reserved_amount", "limit_price"):
        op.drop_column("paper_orders", col)
    op.drop_constraint(op.f("fk_users_created_by_id_users"), "users", type_="foreignkey")
    op.drop_constraint(op.f("ck_users_user_role"), "users", type_="check")
    op.drop_constraint(op.f("uq_users_username"), "users", type_="unique")
    for col in ("created_by_id", "deleted_at", "last_heartbeat_at", "last_activity_at", "last_login_at",
                "password_changed_at", "must_change_password", "role", "username"):
        op.drop_column("users", col)
