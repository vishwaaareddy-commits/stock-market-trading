"""Endpoints scoped to the authenticated user. Every query filters on `user.id` from the
session; there is no user-id parameter, so one user can never read another's data here."""

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import client_ip, get_current_user, get_db_or_503
from app.core.config import Settings, get_settings
from app.models.enums import OrderStatus, TradeStatus
from app.models.instrument import Instrument
from app.models.paper_order import PaperOrder
from app.models.paper_trade import PaperTrade
from app.models.user import User
from app.models.wallet import WalletTransaction
from app.schemas.api import (
    InstrumentOut,
    OrderIn,
    OrderOut,
    PositionOut,
    TradeOut,
    WalletOut,
    WalletTxOut,
)
from app.services import paper
from app.services import wallet as wallets

router = APIRouter(tags=["wallet", "paper-trading"])

Limit = Query(default=50, ge=1, le=200)
Offset = Query(default=0, ge=0)


@router.get("/wallet", response_model=WalletOut)
def my_wallet(user: User = Depends(get_current_user), db: Session = Depends(get_db_or_503)) -> dict:
    """The caller's VIRTUAL wallet. Read-only: users cannot change their own balance."""
    summary = paper.wallet_summary(db, user.id)
    db.commit()  # ensure_wallet may have created the row
    return summary


@router.get("/wallet/transactions", response_model=list[WalletTxOut])
def my_transactions(
    limit: int = Limit, offset: int = Offset,
    user: User = Depends(get_current_user), db: Session = Depends(get_db_or_503),
):
    return db.scalars(
        select(WalletTransaction).where(WalletTransaction.user_id == user.id)
        .order_by(WalletTransaction.seq.desc()).limit(limit).offset(offset)
    ).all()


@router.get("/paper/instruments", response_model=list[InstrumentOut])
def instruments(user: User = Depends(get_current_user), db: Session = Depends(get_db_or_503)):
    return db.scalars(select(Instrument).where(Instrument.is_active.is_(True)).order_by(Instrument.symbol)).all()


@router.post("/paper/orders", response_model=OrderOut)
def place_order(
    body: OrderIn,
    request: Request,
    idempotency_key: str = Header(min_length=1, max_length=64, alias="Idempotency-Key"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db_or_503),
    settings: Settings = Depends(get_settings),
):
    """Place a PAPER order (never sent to any broker). Repeating the same Idempotency-Key
    returns the original order without reserving funds twice."""
    try:
        order, created = paper.place_order(
            db, settings, user, instrument_id=body.instrument_id, side=body.side, quantity=body.quantity,
            limit_price=body.limit_price, idempotency_key=idempotency_key, strategy_id=body.strategy_id,
            ip=client_ip(request, settings),
        )
    except paper.PaperTradingError as exc:
        conflict = exc.code in ("idempotency_conflict", "account_inactive")
        raise HTTPException(
            status.HTTP_409_CONFLICT if conflict else status.HTTP_422_UNPROCESSABLE_ENTITY,
            {"code": exc.code, "message": exc.message},
        )
    if order.status == OrderStatus.REJECTED:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": {"code": "order_rejected", "message": order.status_reason,
                                "order": OrderOut.model_validate(order).model_dump(mode="json")}},
        )
    return order


@router.post("/paper/orders/{order_id}/cancel", response_model=OrderOut)
def cancel_order(
    order_id: int, request: Request,
    user: User = Depends(get_current_user), db: Session = Depends(get_db_or_503),
    settings: Settings = Depends(get_settings),
):
    try:
        return paper.cancel_order(db, user, order_id, ip=client_ip(request, settings))
    except paper.PaperTradingError as exc:
        code = status.HTTP_404_NOT_FOUND if exc.code == "not_found" else status.HTTP_409_CONFLICT
        raise HTTPException(code, {"code": exc.code, "message": exc.message})


@router.get("/paper/orders", response_model=list[OrderOut])
def my_orders(
    limit: int = Limit, offset: int = Offset,
    user: User = Depends(get_current_user), db: Session = Depends(get_db_or_503),
):
    return db.scalars(
        select(PaperOrder).where(PaperOrder.user_id == user.id)
        .order_by(PaperOrder.created_at.desc(), PaperOrder.id.desc()).limit(limit).offset(offset)
    ).all()


@router.get("/paper/trades", response_model=list[TradeOut])
def my_trades(
    status_: TradeStatus | None = Query(default=None, alias="status"),
    limit: int = Limit, offset: int = Offset,
    user: User = Depends(get_current_user), db: Session = Depends(get_db_or_503),
):
    stmt = select(PaperTrade).where(PaperTrade.user_id == user.id)
    if status_:
        stmt = stmt.where(PaperTrade.status == status_)
    return db.scalars(stmt.order_by(PaperTrade.opened_at.desc(), PaperTrade.id.desc()).limit(limit).offset(offset)).all()


@router.get("/paper/positions", response_model=list[PositionOut])
def my_positions(user: User = Depends(get_current_user), db: Session = Depends(get_db_or_503)):
    return paper.positions(db, user.id)


@router.get("/paper/performance")
def my_performance(user: User = Depends(get_current_user), db: Session = Depends(get_db_or_503)):
    out = paper.performance(db, user.id)
    db.commit()
    return out
