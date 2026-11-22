"""Paper (simulated) order lifecycle wired to the virtual wallet. NEVER contacts a broker.

Lifecycle
  place_order : PENDING order; BUY reserves funds (limit price * qty + estimated charges),
                SELL checks free holdings (long-only, no short selling).
                Insufficient funds -> the order is stored as REJECTED and nothing is debited.
  fill_order  : internal hook for the (future) simulated execution engine. It is NOT exposed
                over HTTP: nothing here pretends a trade executed.
  cancel_order / reject_order : release any reserved funds.

All operations are idempotent: duplicate placement (same Idempotency-Key), duplicate fills and
duplicate cancels never move money twice. Each runs in a single DB transaction under the
user's wallet row lock.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.candle import Candle
from app.models.enums import OrderSide, OrderStatus, TradeStatus
from app.models.instrument import Instrument
from app.models.paper_order import PaperOrder
from app.models.paper_trade import PaperTrade
from app.models.user import User
from app.services import audit
from app.services import wallet as wallets
from app.services.wallet import InsufficientFunds, q

MAX_QUANTITY = 1_000_000
MAX_PRICE = Decimal("100000000")


class PaperTradingError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _assert_same_request(order: PaperOrder, *, instrument_id, side, quantity, limit_price, strategy_id) -> None:
    """An Idempotency-Key may only be replayed with the SAME order details."""
    same = (
        order.instrument_id == instrument_id
        and order.side == side
        and order.quantity == quantity
        and order.limit_price is not None
        and q(order.limit_price) == limit_price
        and order.strategy_id == strategy_id
    )
    if not same:
        raise PaperTradingError(
            "idempotency_conflict", "This Idempotency-Key was already used for a different order"
        )


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _charge(turnover: Decimal, settings: Settings) -> Decimal:
    return q(turnover * settings.paper_charge_rate)


# --- queries ----------------------------------------------------------------------------
def get_order(db: Session, order_id: int, *, for_update: bool = False) -> PaperOrder | None:
    stmt = select(PaperOrder).where(PaperOrder.id == order_id)
    if for_update:
        # populate_existing: if this session already holds the order from an earlier unlocked read,
        # refresh it with the row as it is NOW that we hold the lock (a concurrent cancel/fill may
        # have changed it while we waited).
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    return db.scalar(stmt)


def open_lots(db: Session, user_id: int, instrument_id: int | None = None, *, for_update: bool = False):
    stmt = select(PaperTrade).where(PaperTrade.user_id == user_id, PaperTrade.status == TradeStatus.OPEN)
    if instrument_id is not None:
        stmt = stmt.where(PaperTrade.instrument_id == instrument_id)
    stmt = stmt.order_by(PaperTrade.opened_at, PaperTrade.id)
    if for_update:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    return db.scalars(stmt).all()


def _held_quantity(db: Session, user_id: int, instrument_id: int) -> int:
    return sum(l.quantity for l in open_lots(db, user_id, instrument_id))


def _pending_sell_quantity(db: Session, user_id: int, instrument_id: int) -> int:
    return db.scalar(
        select(func.coalesce(func.sum(PaperOrder.quantity), 0)).where(
            PaperOrder.user_id == user_id,
            PaperOrder.instrument_id == instrument_id,
            PaperOrder.side == OrderSide.SELL,
            PaperOrder.status == OrderStatus.PENDING,
        )
    )


# --- placement --------------------------------------------------------------------------
def place_order(
    db: Session,
    settings: Settings,
    user: User,
    *,
    instrument_id: int,
    side: OrderSide,
    quantity: int,
    limit_price: Decimal,
    idempotency_key: str,
    strategy_id: int | None = None,
    signal_id: int | None = None,
    ip: str | None = None,
) -> tuple[PaperOrder, bool]:
    """Returns (order, created). `created` is False when the idempotency key was seen before."""
    try:
        side = OrderSide(side)
    except ValueError:
        raise PaperTradingError("invalid_side", "Side must be BUY or SELL") from None
    if not idempotency_key or len(idempotency_key) > 64:
        raise PaperTradingError("invalid_idempotency_key", "Idempotency-Key (max 64 chars) is required")
    if not 0 < quantity <= MAX_QUANTITY:
        raise PaperTradingError("invalid_quantity", f"Quantity must be between 1 and {MAX_QUANTITY}")
    limit_price = q(limit_price)
    if not 0 < limit_price <= MAX_PRICE:
        raise PaperTradingError("invalid_price", "Price must be greater than zero")

    wallet = wallets.lock_wallet(db, user.id)  # serialises this user's order activity

    # The account may have been deactivated/deleted while this request waited for the lock.
    db.refresh(user)
    if not user.is_active or user.deleted_at is not None:
        raise PaperTradingError("account_inactive", "This account is not active")

    same_args = dict(instrument_id=instrument_id, side=side, quantity=quantity, limit_price=limit_price,
                     strategy_id=strategy_id)
    existing = db.scalar(
        select(PaperOrder).where(PaperOrder.user_id == user.id, PaperOrder.idempotency_key == idempotency_key)
    )
    if existing is not None:
        _assert_same_request(existing, **same_args)
        return existing, False

    instrument = db.get(Instrument, instrument_id)
    if instrument is None or not instrument.is_active:
        raise PaperTradingError("unknown_instrument", "Instrument not found")

    order = PaperOrder(
        user_id=user.id,
        strategy_id=strategy_id,
        signal_id=signal_id,
        instrument_id=instrument_id,
        side=side,
        quantity=quantity,
        status=OrderStatus.PENDING,
        limit_price=limit_price,
        reserved_amount=Decimal("0"),
        charges=Decimal("0"),
        idempotency_key=idempotency_key,
    )
    db.add(order)
    try:
        db.flush()
    except IntegrityError:  # concurrent duplicate with the same key
        db.rollback()
        dup = db.scalar(
            select(PaperOrder).where(PaperOrder.user_id == user.id, PaperOrder.idempotency_key == idempotency_key)
        )
        if dup is None:
            raise
        _assert_same_request(dup, **same_args)
        return dup, False

    if side == OrderSide.BUY:
        turnover = q(limit_price * quantity)
        reserve = turnover + _charge(turnover, settings)
        try:
            wallets.reserve_buy(db, wallet, order_id=order.id, amount=reserve, actor_id=user.id)
        except InsufficientFunds:
            db.rollback()  # discard the failed attempt entirely, then persist a REJECTED record
            return _store_rejected(db, user, instrument_id, side, quantity, limit_price, idempotency_key,
                                   strategy_id, signal_id, "Insufficient virtual funds", ip), True
        order.reserved_amount = reserve
    else:
        # The new order is already flushed as PENDING, so subtract it from the pending total
        # to get the quantity reserved by *other* open sell orders.
        other_pending = _pending_sell_quantity(db, user.id, instrument_id) - quantity
        free = _held_quantity(db, user.id, instrument_id) - other_pending
        if quantity > free:
            db.rollback()
            return _store_rejected(db, user, instrument_id, side, quantity, limit_price, idempotency_key,
                                   strategy_id, signal_id, "Insufficient holdings (short selling is not allowed)", ip), True

    audit.record(db, "ORDER_CREATED", actor=user, resource_type="paper_order", resource_id=order.id,
                 details={"side": side.value, "quantity": quantity, "limit_price": str(limit_price),
                          "instrument_id": instrument_id, "mode": "PAPER"}, ip=ip)
    audit_touch(user)
    db.commit()
    return order, True


def _store_rejected(db, user, instrument_id, side, quantity, limit_price, key, strategy_id, signal_id, reason, ip):
    wallets.lock_wallet(db, user.id)
    order = PaperOrder(
        user_id=user.id, strategy_id=strategy_id, signal_id=signal_id, instrument_id=instrument_id,
        side=side, quantity=quantity, status=OrderStatus.REJECTED, limit_price=limit_price,
        reserved_amount=Decimal("0"), charges=Decimal("0"), idempotency_key=key, status_reason=reason,
    )
    db.add(order)
    db.flush()
    audit.record(db, "ORDER_REJECTED", actor=user, resource_type="paper_order", resource_id=order.id,
                 details={"reason": reason, "mode": "PAPER"}, ip=ip)
    db.commit()
    return order


def audit_touch(user: User) -> None:
    user.last_activity_at = _now()


# --- cancel / reject --------------------------------------------------------------------
def _release_pending_locked(db: Session, wallet, order: PaperOrder, new_status: OrderStatus, reason: str,
                            actor: User, ip: str | None) -> Decimal:
    """Close one PENDING order and release its reservation. The caller holds the wallet lock and
    has just re-read `order` under its own row lock; the caller commits. Returns funds released."""
    released = Decimal("0")
    if order.reserved_amount > 0:
        released = order.reserved_amount
        wallets.release_reservation(db, wallet, order_id=order.id, amount=released,
                                    actor_id=actor.id, why=reason.lower()[:60])
        order.reserved_amount = Decimal("0")
    order.status = new_status
    order.status_reason = reason
    audit.record(db, "ORDER_CANCELLED" if new_status == OrderStatus.CANCELLED else "ORDER_REJECTED",
                 actor=actor, resource_type="paper_order", resource_id=order.id,
                 details={"reason": reason, "mode": "PAPER", "released": str(released)}, ip=ip)
    return released


def _close_pending(db: Session, order_id: int, user_id: int, new_status: OrderStatus, reason: str,
                   actor: User, ip: str | None) -> PaperOrder:
    wallet = wallets.lock_wallet(db, user_id)
    order = get_order(db, order_id, for_update=True)  # fresh read under the row lock
    if order is None or order.user_id != user_id:
        raise PaperTradingError("not_found", "Order not found")
    if order.status == new_status:
        return order  # idempotent repeat
    if order.status != OrderStatus.PENDING:
        raise PaperTradingError("not_cancellable", f"Order is already {order.status.value}")
    _release_pending_locked(db, wallet, order, new_status, reason, actor, ip)
    db.commit()
    return order


def cancel_all_pending(db: Session, user_id: int, actor: User, reason: str,
                       ip: str | None = None) -> tuple[int, Decimal]:
    """Cancel every PENDING order of a user and release all reserved funds, WITHOUT committing:
    the caller commits, so this is atomic with whatever else it does (e.g. a soft delete).

    Safe to call twice: only orders still PENDING under the lock are touched, so a reservation
    can never be released more than once. Returns (orders cancelled, funds released)."""
    wallet = wallets.lock_wallet(db, user_id)
    pending = db.scalars(
        select(PaperOrder)
        .where(PaperOrder.user_id == user_id, PaperOrder.status == OrderStatus.PENDING)
        .order_by(PaperOrder.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    ).all()
    released = Decimal("0")
    for order in pending:
        released += _release_pending_locked(db, wallet, order, OrderStatus.CANCELLED, reason, actor, ip)
    return len(pending), released


def cancel_order(db: Session, user: User, order_id: int, ip: str | None = None) -> PaperOrder:
    return _close_pending(db, order_id, user.id, OrderStatus.CANCELLED, "Cancelled by user", user, ip)


def reject_order(db: Session, order_id: int, user_id: int, reason: str, actor: User) -> PaperOrder:
    """Engine hook: reject a pending order and release its reserved funds."""
    return _close_pending(db, order_id, user_id, OrderStatus.REJECTED, reason, actor, None)


# --- fill (internal hook for the future execution engine) -------------------------------
def fill_order(db: Session, settings: Settings, order_id: int, fill_price: Decimal,
               *, filled_at: datetime | None = None) -> PaperOrder:
    """Execute a pending paper order at `fill_price` (the caller applies any slippage model).

    Not exposed over HTTP. Idempotent: filling an already FILLED order is a no-op.
    """
    # Read only the owner id (no entity is cached), take the wallet lock FIRST (same order as
    # place/cancel, so no deadlocks), then load the order under its row lock. That read is forced
    # fresh, so a cancel/fill that committed while we waited is seen and never acted on with stale
    # data. Outcomes are deterministic: FILLED -> no-op, CANCELLED/REJECTED -> clean domain error.
    owner_id = db.scalar(select(PaperOrder.user_id).where(PaperOrder.id == order_id))
    if owner_id is None:
        raise PaperTradingError("not_found", "Order not found")
    user = db.get(User, owner_id)
    wallet = wallets.lock_wallet(db, owner_id)
    order = get_order(db, order_id, for_update=True)
    if order.status == OrderStatus.FILLED:
        return order
    if order.status != OrderStatus.PENDING:
        raise PaperTradingError("not_fillable", f"Order is {order.status.value}")

    fill_price = q(fill_price)
    if fill_price <= 0:
        raise PaperTradingError("invalid_price", "Fill price must be greater than zero")
    now = filled_at or _now()
    qty = order.quantity
    turnover = q(fill_price * qty)
    charge = _charge(turnover, settings)

    if order.side == OrderSide.BUY:
        if fill_price > order.limit_price:
            raise PaperTradingError("price_outside_limit", "BUY cannot fill above its limit price")
        lot = PaperTrade(
            user_id=order.user_id, strategy_id=order.strategy_id, instrument_id=order.instrument_id,
            entry_order_id=order.id, quantity=qty, entry_price=fill_price, status=TradeStatus.OPEN,
            entry_charge=charge, exit_charge=Decimal("0"), opened_at=now,
        )
        db.add(lot)
        db.flush()
        wallets.settle_buy(db, wallet, order_id=order.id, trade_id=lot.id, cost=turnover, charge=charge,
                           reserved=order.reserved_amount, actor_id=user.id)
        order.reserved_amount = Decimal("0")
    else:
        if fill_price < order.limit_price:
            raise PaperTradingError("price_outside_limit", "SELL cannot fill below its limit price")
        total_pnl, first_trade_id = _close_lots_fifo(db, order, fill_price, charge, now)
        wallets.settle_sell(db, wallet, order_id=order.id, trade_id=first_trade_id, proceeds=turnover,
                            charge=charge, actor_id=user.id)
        wallets.add_realized_pnl(db, wallet, total_pnl)

    order.status = OrderStatus.FILLED
    order.fill_price = fill_price
    order.filled_at = now
    order.charges = charge
    audit.record(db, "ORDER_FILLED", actor=user, resource_type="paper_order", resource_id=order.id,
                 details={"side": order.side.value, "quantity": qty, "fill_price": str(fill_price), "mode": "PAPER"})
    db.commit()
    return order


def _close_lots_fifo(db: Session, order: PaperOrder, price: Decimal, charge: Decimal, now: datetime):
    lots = open_lots(db, order.user_id, order.instrument_id, for_update=True)
    if sum(l.quantity for l in lots) < order.quantity:
        raise PaperTradingError("insufficient_holdings", "Not enough open holdings (no short selling)")
    remaining, allocated, total_pnl, first_id = order.quantity, Decimal("0"), Decimal("0"), None
    for lot in lots:
        if remaining == 0:
            break
        take = min(lot.quantity, remaining)
        last_piece = take == remaining
        exit_part = (charge - allocated) if last_piece else q(charge * take / order.quantity)
        entry_part = lot.entry_charge if take == lot.quantity else q(lot.entry_charge * take / lot.quantity)
        pnl = q((price - lot.entry_price) * take - entry_part - exit_part)
        if take == lot.quantity:
            closed = lot
        else:
            closed = PaperTrade(
                user_id=lot.user_id, strategy_id=lot.strategy_id, instrument_id=lot.instrument_id,
                entry_order_id=lot.entry_order_id, quantity=take, entry_price=lot.entry_price,
                opened_at=lot.opened_at,
            )
            db.add(closed)
            lot.quantity -= take
            lot.entry_charge = lot.entry_charge - entry_part
        closed.status = TradeStatus.CLOSED
        closed.exit_order_id = order.id
        closed.exit_price = price
        closed.entry_charge = entry_part
        closed.exit_charge = exit_part
        closed.pnl = pnl
        closed.closed_at = now
        db.flush()
        first_id = first_id or closed.id
        allocated += exit_part
        total_pnl += pnl
        remaining -= take
    return total_pnl, first_id


# --- read models ------------------------------------------------------------------------
def last_price(db: Session, instrument_id: int) -> Decimal | None:
    return db.scalar(
        select(Candle.close).where(Candle.instrument_id == instrument_id).order_by(Candle.open_time.desc()).limit(1)
    )


@dataclass
class Position:
    instrument_id: int
    symbol: str
    quantity: int
    avg_entry_price: Decimal
    cost_basis: Decimal
    last_price: Decimal | None
    unrealized_pnl: Decimal | None


def positions(db: Session, user_id: int) -> list[Position]:
    lots = open_lots(db, user_id)
    by_inst: dict[int, list[PaperTrade]] = {}
    for lot in lots:
        by_inst.setdefault(lot.instrument_id, []).append(lot)
    out = []
    for inst_id, group in by_inst.items():
        qty = sum(l.quantity for l in group)
        cost = q(sum((l.entry_price * l.quantity for l in group), Decimal("0")))
        inst = db.get(Instrument, inst_id)
        price = last_price(db, inst_id)
        out.append(Position(inst_id, inst.symbol if inst else str(inst_id), qty, q(cost / qty), cost, price,
                            q(price * qty - cost) if price is not None else None))
    return sorted(out, key=lambda p: p.symbol)


def wallet_summary(db: Session, user_id: int) -> dict:
    wallet = wallets.ensure_wallet(db, user_id)
    pos = positions(db, user_id)
    invested = sum((p.cost_basis for p in pos), Decimal("0"))
    unreal_known = all(p.unrealized_pnl is not None for p in pos)
    unrealized = sum((p.unrealized_pnl for p in pos if p.unrealized_pnl is not None), Decimal("0"))
    cash = wallet.available_balance + wallet.reserved_balance
    return {
        "currency": "VIRTUAL_INR",
        "is_virtual": True,
        "available_balance": wallet.available_balance,
        "reserved_balance": wallet.reserved_balance,
        "invested_cost": q(invested),
        "realized_pnl": wallet.realized_pnl,
        "unrealized_pnl": q(unrealized) if (pos and unreal_known) else (Decimal("0") if not pos else None),
        # equity = cash (available + reserved) + holdings at market when every price is known, else at cost
        "total_equity": q(cash + invested + (unrealized if unreal_known else Decimal("0"))),
        "equity_basis": "market" if unreal_known else "cost",
    }


def performance(db: Session, user_id: int) -> dict:
    summary = wallet_summary(db, user_id)
    closed = db.scalars(select(PaperTrade).where(PaperTrade.user_id == user_id,
                                                 PaperTrade.status == TradeStatus.CLOSED)).all()
    wins = sum(1 for t in closed if (t.pnl or 0) > 0)
    return {
        "is_virtual": True,
        "realized_pnl": summary["realized_pnl"],
        "unrealized_pnl": summary["unrealized_pnl"],
        "total_equity": summary["total_equity"],
        "closed_trades": len(closed),
        "winning_trades": wins,
        "win_rate": (Decimal(wins) / len(closed) * 100).quantize(Decimal("0.01")) if closed else None,
        "total_charges": q(sum(((t.entry_charge or 0) + (t.exit_charge or 0) for t in closed), Decimal("0"))),
        "open_positions": len(positions(db, user_id)),
    }
