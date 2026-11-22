"""Virtual wallet accounting. SIMULATED FUNDS ONLY - no bank, payment or broker connection.

Every balance change goes through `_apply`, which:
  1. performs ONE atomic conditional UPDATE (`... WHERE available + delta >= 0`), so two
     concurrent requests can never spend the same funds, even without row locks;
  2. appends a ledger row in the same transaction. If either step fails the whole
     transaction rolls back, so a balance never changes without its ledger entry.

Callers hold the wallet row lock (`lock_wallet`, SELECT ... FOR UPDATE on PostgreSQL) so that
multi-step operations (order checks + reservation) are serialised per user.
"""

from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.enums import WalletTxType
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.services import audit

MONEY_Q = Decimal("0.0001")
MAX_ADJUSTMENT = Decimal("1000000000")  # 100 crore virtual rupees per operation


def q(value: Decimal) -> Decimal:
    return value.quantize(MONEY_Q, rounding=ROUND_HALF_UP)


class WalletError(Exception):
    code = "wallet_error"


class InsufficientFunds(WalletError):
    code = "insufficient_funds"


class InvalidAmount(WalletError):
    code = "invalid_amount"


class IdempotencyConflict(WalletError):
    code = "idempotency_conflict"


def ensure_wallet(db: Session, user_id: int) -> Wallet:
    wallet = db.scalar(select(Wallet).where(Wallet.user_id == user_id))
    if wallet is None:
        wallet = Wallet(
            user_id=user_id,
            available_balance=Decimal("0"),
            reserved_balance=Decimal("0"),
            realized_pnl=Decimal("0"),
        )
        db.add(wallet)
        db.flush()
    return wallet


def lock_wallet(db: Session, user_id: int) -> Wallet:
    """Fetch the wallet row with a write lock (no-op on SQLite)."""
    # populate_existing: a row read earlier in this session must be refreshed with the values
    # that are current now that we hold the lock (otherwise decisions use stale data).
    wallet = db.scalar(
        select(Wallet).where(Wallet.user_id == user_id).with_for_update().execution_options(populate_existing=True)
    )
    return wallet if wallet is not None else ensure_wallet(db, user_id)


def _apply(
    db: Session,
    wallet: Wallet,
    *,
    tx_type: WalletTxType,
    d_available: Decimal,
    d_reserved: Decimal,
    description: str,
    actor_id: int | None,
    order_id: int | None = None,
    trade_id: int | None = None,
    idempotency_key: str | None = None,
) -> WalletTransaction:
    d_available, d_reserved = q(d_available), q(d_reserved)
    # round(..., 4) keeps the guard exact to the ledger's precision on every database
    # (PostgreSQL NUMERIC is already exact; SQLite, used in tests, would otherwise see
    # float noise such as -3.5e-15 after subtracting equal amounts).
    new_available = func.round(Wallet.available_balance + d_available, 4)
    new_reserved = func.round(Wallet.reserved_balance + d_reserved, 4)
    result = db.execute(
        update(Wallet)
        .where(Wallet.id == wallet.id, new_available >= 0, new_reserved >= 0)
        .values(available_balance=new_available, reserved_balance=new_reserved)
    )
    if result.rowcount != 1:
        raise InsufficientFunds("Insufficient virtual funds")
    db.refresh(wallet)  # picks up the new balances (row is locked by our UPDATE until commit)
    tx = WalletTransaction(
        wallet_id=wallet.id,
        user_id=wallet.user_id,
        type=tx_type,
        amount=d_available,
        reserved_delta=d_reserved,
        available_before=wallet.available_balance - d_available,
        available_after=wallet.available_balance,
        reserved_before=wallet.reserved_balance - d_reserved,
        reserved_after=wallet.reserved_balance,
        paper_order_id=order_id,
        paper_trade_id=trade_id,
        description=description[:500],
        actor_user_id=actor_id,
        idempotency_key=idempotency_key,
    )
    db.add(tx)
    db.flush()
    return tx


# --- allocation by Super Admin ----------------------------------------------------------
def credit_initial(db: Session, user: User, amount: Decimal, actor: User) -> WalletTransaction | None:
    wallet = lock_wallet(db, user.id)
    amount = _validate_amount(amount, allow_zero=True)
    if amount == 0:
        return None
    return _apply(
        db,
        wallet,
        tx_type=WalletTxType.INITIAL_CREDIT,
        d_available=amount,
        d_reserved=Decimal("0"),
        description="Initial virtual allocation",
        actor_id=actor.id,
    )


def _validate_amount(amount: Decimal, *, allow_zero: bool = False) -> Decimal:
    if not isinstance(amount, Decimal) or not amount.is_finite():
        raise InvalidAmount("Amount must be a valid number")
    amount = q(amount)
    if amount < 0 or (amount == 0 and not allow_zero):
        raise InvalidAmount("Amount must be greater than zero")
    if amount > MAX_ADJUSTMENT:
        raise InvalidAmount("Amount exceeds the per-operation limit")
    return amount


def admin_adjust(
    db: Session,
    *,
    target: User,
    actor: User,
    kind: str,  # "RECHARGE" | "DEDUCT"
    amount: Decimal,
    reason: str,
    idempotency_key: str | None = None,
    ip: str | None = None,
) -> tuple[WalletTransaction, bool]:
    """Super Admin credit/debit of VIRTUAL funds. Returns (transaction, created).

    A repeated request with the same idempotency key returns the original transaction and
    does not change the balance again.
    """
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise WalletError("A reason of at least 3 characters is required")
    if kind not in ("RECHARGE", "DEDUCT"):
        raise WalletError("kind must be RECHARGE or DEDUCT")
    amount = _validate_amount(amount)

    recharge = kind == "RECHARGE"
    want_type = WalletTxType.ADMIN_RECHARGE if recharge else WalletTxType.ADMIN_ADJUSTMENT
    want_amount = q(amount if recharge else -amount)

    def same_request(tx: WalletTransaction) -> bool:
        return tx.type == want_type and q(tx.amount) == want_amount and tx.description == reason[:500]

    def replay(tx: WalletTransaction) -> tuple[WalletTransaction, bool]:
        if not same_request(tx):
            raise IdempotencyConflict("This Idempotency-Key was already used for a different adjustment")
        return tx, False

    wallet = lock_wallet(db, target.id)
    if idempotency_key:
        existing = db.scalar(
            select(WalletTransaction).where(
                WalletTransaction.wallet_id == wallet.id,
                WalletTransaction.idempotency_key == idempotency_key,
            )
        )
        if existing is not None:
            return replay(existing)

    try:
        tx = _apply(
            db,
            wallet,
            tx_type=WalletTxType.ADMIN_RECHARGE if recharge else WalletTxType.ADMIN_ADJUSTMENT,
            d_available=amount if recharge else -amount,
            d_reserved=Decimal("0"),
            description=reason,
            actor_id=actor.id,
            idempotency_key=idempotency_key,
        )
        audit.record(
            db,
            "WALLET_RECHARGE" if recharge else "WALLET_DEDUCTION",
            actor=actor,
            resource_type="wallet",
            resource_id=wallet.id,
            details={"target_user_id": target.id, "amount": str(amount), "reason": reason},
            ip=ip,
        )
        db.commit()
    except IntegrityError:
        # Lost a race with an identical request: return the winner's transaction.
        db.rollback()
        existing = db.scalar(
            select(WalletTransaction)
            .join(Wallet, Wallet.id == WalletTransaction.wallet_id)
            .where(Wallet.user_id == target.id, WalletTransaction.idempotency_key == idempotency_key)
        )
        if existing is None:
            raise
        return replay(existing)
    except WalletError:
        db.rollback()
        raise
    return tx, True


# --- trading primitives (called by services.paper inside one transaction) ---------------
def reserve_buy(db, wallet, *, order_id: int, amount: Decimal, actor_id: int) -> WalletTransaction:
    return _apply(
        db, wallet, tx_type=WalletTxType.TRADE_BUY, d_available=-amount, d_reserved=amount,
        description=f"Funds reserved for BUY order #{order_id}", actor_id=actor_id, order_id=order_id,
    )


def release_reservation(db, wallet, *, order_id: int, amount: Decimal, actor_id: int, why: str) -> WalletTransaction:
    return _apply(
        db, wallet, tx_type=WalletTxType.TRADE_REFUND, d_available=amount, d_reserved=-amount,
        description=f"Reservation released for order #{order_id} ({why})", actor_id=actor_id, order_id=order_id,
    )


def settle_buy(db, wallet, *, order_id: int, trade_id: int, cost: Decimal, charge: Decimal,
               reserved: Decimal, actor_id: int) -> None:
    """Consume the reservation: purchase value + charge are spent, any leftover is refunded."""
    leftover = reserved - cost - charge
    if leftover < 0:
        raise WalletError("Fill exceeds reserved funds")
    _apply(db, wallet, tx_type=WalletTxType.TRADE_BUY, d_available=Decimal("0"), d_reserved=-cost,
           description=f"BUY order #{order_id} filled", actor_id=actor_id, order_id=order_id, trade_id=trade_id)
    if charge:
        _apply(db, wallet, tx_type=WalletTxType.TRADE_CHARGE, d_available=Decimal("0"), d_reserved=-charge,
               description=f"Simulated charges for BUY order #{order_id}", actor_id=actor_id,
               order_id=order_id, trade_id=trade_id)
    if leftover:
        _apply(db, wallet, tx_type=WalletTxType.TRADE_REFUND, d_available=leftover, d_reserved=-leftover,
               description=f"Unused reservation returned for order #{order_id}", actor_id=actor_id,
               order_id=order_id, trade_id=trade_id)


def settle_sell(db, wallet, *, order_id: int, trade_id: int | None, proceeds: Decimal, charge: Decimal,
                actor_id: int) -> None:
    _apply(db, wallet, tx_type=WalletTxType.TRADE_SELL, d_available=proceeds, d_reserved=Decimal("0"),
           description=f"SELL order #{order_id} filled", actor_id=actor_id, order_id=order_id, trade_id=trade_id)
    if charge:
        _apply(db, wallet, tx_type=WalletTxType.TRADE_CHARGE, d_available=-charge, d_reserved=Decimal("0"),
               description=f"Simulated charges for SELL order #{order_id}", actor_id=actor_id,
               order_id=order_id, trade_id=trade_id)


def add_realized_pnl(db: Session, wallet: Wallet, pnl: Decimal) -> None:
    db.execute(update(Wallet).where(Wallet.id == wallet.id).values(realized_pnl=Wallet.realized_pnl + q(pnl)))
    db.refresh(wallet)
