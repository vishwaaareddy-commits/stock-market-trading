"""Super Admin control area. The router-level dependency enforces SUPER_ADMIN on EVERY route
here; frontend route hiding is only cosmetic."""

from datetime import timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import client_identity, client_ip, get_db_or_503, require_super_admin
from app.core.config import Settings, get_settings
from app.models.audit_log import AuditLog
from app.models.enums import OrderStatus, TradeStatus, UserRole
from app.models.paper_order import PaperOrder
from app.models.paper_trade import PaperTrade
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.schemas.api import (
    AdminCreateIn,
    AdminRow,
    AdminUpdateIn,
    AuditOut,
    CredentialOut,
    OrderOut,
    PasswordResetIn,
    PositionOut,
    SessionOut,
    TradeOut,
    WalletAdjustIn,
    WalletOut,
    WalletRow,
    WalletTxOut,
)
from app.services import audit, paper
from app.services import auth as auth_service
from app.services import users as user_service
from app.services import wallet as wallets

router = APIRouter(prefix="/admin", tags=["super-admin"], dependencies=[Depends(require_super_admin)])

Limit = Query(default=50, ge=1, le=200)
Offset = Query(default=0, ge=0)


def _http(exc: user_service.UserError) -> HTTPException:
    return HTTPException(exc.status, {"code": exc.code, "message": exc.message})


def _row(user: User, db: Session, settings: Settings, counts: dict[int, int], wallet: Wallet | None) -> AdminRow:
    row = AdminRow.model_validate(user)
    row.active_sessions = counts.get(user.id, 0)
    row.online = auth_service.is_online(user, row.active_sessions, settings)
    if wallet is not None:
        row.available_balance, row.reserved_balance = wallet.available_balance, wallet.reserved_balance
    return row


def _wallet_for(db: Session, user_id: int) -> Wallet | None:
    return db.scalar(select(Wallet).where(Wallet.user_id == user_id))


# --- diagnostics ------------------------------------------------------------------------
@router.get("/diagnostics/client-ip")
def diagnose_client_ip(request: Request, settings: Settings = Depends(get_settings)) -> dict:
    """Shows how THIS request reached the app, so the real proxy chain can be observed and
    TRUSTED_PROXY_HOPS set correctly. Only echoes the caller's own request metadata."""
    who = client_identity(request, settings)
    return {
        "tcp_peer": request.client.host if request.client else None,
        "x_forwarded_for_as_received": [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()],
        "trusted_proxy_hops": settings.trusted_proxy_hops,
        "derived_client_address": who.address,
        "source": who.source,
        "per_ip_throttling_active": who.throttle_key is not None,
        "how_to_use": (
            "Sign in through your real frontend URL and open this page. If the entry that is your own "
            "public IP is N-th from the right of x_forwarded_for_as_received, set TRUSTED_PROXY_HOPS=N."
        ),
    }


# --- dashboard --------------------------------------------------------------------------
@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db_or_503), settings: Settings = Depends(get_settings)) -> dict:
    admins = db.scalars(select(User).where(User.role == UserRole.ADMIN, User.deleted_at.is_(None))
                        .order_by(User.username)).all()
    counts = auth_service.active_session_counts(db, settings)
    wallets_by_user = {w.user_id: w for w in db.scalars(select(Wallet)).all()}
    online = [a for a in admins if auth_service.is_online(a, counts.get(a.id, 0), settings)]
    deactivated = [a for a in admins if not a.is_active]
    summaries = []
    for a in admins:
        w = wallets_by_user.get(a.id)
        orders = db.scalar(select(func.count()).select_from(PaperOrder).where(PaperOrder.user_id == a.id)) or 0
        open_pos = db.scalar(select(func.count()).select_from(PaperTrade)
                             .where(PaperTrade.user_id == a.id, PaperTrade.status == TradeStatus.OPEN)) or 0
        summaries.append({
            "user_id": a.id, "username": a.username, "is_active": a.is_active,
            "online": a in online,
            "available_balance": w.available_balance if w else Decimal("0"),
            "reserved_balance": w.reserved_balance if w else Decimal("0"),
            "realized_pnl": w.realized_pnl if w else Decimal("0"),
            "orders": orders, "open_lots": open_pos,
        })
    recent = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(15)).all()
    return {
        "total_admins": len(admins),
        "online_admins": len(online),
        "offline_admins": len([a for a in admins if a.is_active and a not in online]),
        "deactivated_admins": len(deactivated),
        "heartbeat_timeout_seconds": settings.heartbeat_timeout_seconds,
        "recent_activity": [AuditOut.model_validate(r).model_dump(mode="json") for r in recent],
        "admin_summaries": summaries,
    }


# --- user management --------------------------------------------------------------------
@router.get("/users", response_model=list[AdminRow])
def list_admins(
    include_deleted: bool = False,
    db: Session = Depends(get_db_or_503), settings: Settings = Depends(get_settings),
):
    stmt = select(User).where(User.role == UserRole.ADMIN)
    if not include_deleted:
        stmt = stmt.where(User.deleted_at.is_(None))
    users = db.scalars(stmt.order_by(User.created_at.desc())).all()
    counts = auth_service.active_session_counts(db, settings)
    wallets_by_user = {w.user_id: w for w in db.scalars(select(Wallet)).all()}
    return [_row(u, db, settings, counts, wallets_by_user.get(u.id)) for u in users]


@router.post("/users", response_model=CredentialOut, status_code=status.HTTP_201_CREATED)
def create_admin(
    body: AdminCreateIn, request: Request,
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db_or_503), settings: Settings = Depends(get_settings),
):
    """Creates an ADMIN. This is the only way accounts are created, and it can only create
    ADMINs: there is no endpoint that creates or promotes a Super Admin."""
    try:
        user, temp = user_service.create_admin(
            db, settings, actor, username=body.username, email=body.email, display_name=body.display_name,
            password=body.password, initial_balance=body.initial_balance, ip=client_ip(request, settings),
        )
    except user_service.UserError as exc:
        db.rollback()
        raise _http(exc)
    except wallets.WalletError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, {"code": exc.code, "message": str(exc)})
    counts = auth_service.active_session_counts(db, settings)
    return CredentialOut(user=_row(user, db, settings, counts, _wallet_for(db, user.id)), temporary_password=temp)


@router.get("/users/{user_id}", response_model=AdminRow)
def get_admin(user_id: int, db: Session = Depends(get_db_or_503), settings: Settings = Depends(get_settings)):
    try:
        user = user_service.get_user(db, user_id)
    except user_service.UserError as exc:
        raise _http(exc)
    if user.role != UserRole.ADMIN:
        raise HTTPException(status.HTTP_404_NOT_FOUND, {"code": "not_found", "message": "User not found"})
    counts = auth_service.active_session_counts(db, settings)
    return _row(user, db, settings, counts, _wallet_for(db, user.id))


def _managed(db: Session, user_id: int) -> User:
    try:
        return user_service.get_managed_admin(db, user_id)
    except user_service.UserError as exc:
        raise _http(exc)


@router.patch("/users/{user_id}", response_model=AdminRow)
def update_admin(
    user_id: int, body: AdminUpdateIn, request: Request, actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db_or_503), settings: Settings = Depends(get_settings),
):
    target = _managed(db, user_id)
    try:
        user_service.update_profile(db, actor, target, display_name=body.display_name, email=body.email,
                                    ip=client_ip(request, settings))
    except user_service.UserError as exc:
        db.rollback()
        raise _http(exc)
    return _row(target, db, settings, auth_service.active_session_counts(db, settings), _wallet_for(db, target.id))


@router.post("/users/{user_id}/reset-password", response_model=CredentialOut)
def reset_password(
    user_id: int, body: PasswordResetIn, request: Request, actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db_or_503), settings: Settings = Depends(get_settings),
):
    target = _managed(db, user_id)
    try:
        temp = user_service.reset_password(db, settings, actor, target, body.password, ip=client_ip(request, settings))
    except user_service.UserError as exc:
        db.rollback()
        raise _http(exc)
    return CredentialOut(
        user=_row(target, db, settings, auth_service.active_session_counts(db, settings), _wallet_for(db, target.id)),
        temporary_password=temp,
    )


@router.post("/users/{user_id}/deactivate", response_model=AdminRow)
def deactivate(
    user_id: int, request: Request, actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db_or_503), settings: Settings = Depends(get_settings),
):
    target = _managed(db, user_id)
    user_service.set_active(db, actor, target, False, ip=client_ip(request, settings))
    return _row(target, db, settings, auth_service.active_session_counts(db, settings), _wallet_for(db, target.id))


@router.post("/users/{user_id}/reactivate", response_model=AdminRow)
def reactivate(
    user_id: int, request: Request, actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db_or_503), settings: Settings = Depends(get_settings),
):
    target = _managed(db, user_id)
    user_service.set_active(db, actor, target, True, ip=client_ip(request, settings))
    return _row(target, db, settings, auth_service.active_session_counts(db, settings), _wallet_for(db, target.id))


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_admin(
    user_id: int, request: Request, actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db_or_503), settings: Settings = Depends(get_settings),
) -> Response:
    """Soft delete: login is blocked and sessions revoked, but all history is retained."""
    user_service.soft_delete(db, actor, _managed(db, user_id), ip=client_ip(request, settings))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users/{user_id}/sessions", response_model=list[SessionOut])
def admin_sessions(user_id: int, db: Session = Depends(get_db_or_503), settings: Settings = Depends(get_settings)):
    try:
        user_service.get_user(db, user_id)
    except user_service.UserError as exc:
        raise _http(exc)
    return auth_service.active_sessions(db, user_id, settings)


@router.post("/users/{user_id}/sessions/revoke")
def revoke_sessions(
    user_id: int, request: Request, actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db_or_503), settings: Settings = Depends(get_settings),
) -> dict:
    target = _managed(db, user_id)
    revoked = auth_service.revoke_user_sessions(db, target.id, "revoked_by_super_admin")
    audit.record(db, "SESSIONS_REVOKED", actor=actor, resource_type="user", resource_id=target.id,
                 details={"count": revoked}, ip=client_ip(request, settings))
    db.commit()
    return {"revoked": revoked}


# --- wallets (any non-deleted OR deleted user can be READ; only live accounts adjusted) -----
def _any_user(db: Session, user_id: int) -> User:
    try:
        return user_service.get_user(db, user_id)
    except user_service.UserError as exc:
        raise _http(exc)


@router.get("/wallets", response_model=list[WalletRow])
def all_wallets(db: Session = Depends(get_db_or_503)):
    rows = db.execute(select(User, Wallet).join(Wallet, Wallet.user_id == User.id).order_by(User.username)).all()
    return [WalletRow(user_id=u.id, username=u.username, role=u.role, is_active=u.is_active,
                      deleted=u.deleted_at is not None, available_balance=w.available_balance,
                      reserved_balance=w.reserved_balance, realized_pnl=w.realized_pnl) for u, w in rows]


@router.get("/wallets/{user_id}", response_model=WalletOut)
def wallet_of(user_id: int, db: Session = Depends(get_db_or_503)):
    _any_user(db, user_id)
    summary = paper.wallet_summary(db, user_id)
    db.commit()
    return summary


@router.get("/wallets/{user_id}/transactions", response_model=list[WalletTxOut])
def wallet_transactions(user_id: int, limit: int = Limit, offset: int = Offset, db: Session = Depends(get_db_or_503)):
    _any_user(db, user_id)
    return db.scalars(
        select(WalletTransaction).where(WalletTransaction.user_id == user_id)
        .order_by(WalletTransaction.seq.desc()).limit(limit).offset(offset)
    ).all()


@router.post("/wallets/{user_id}/adjust", response_model=WalletTxOut)
def adjust_wallet(
    user_id: int, body: WalletAdjustIn, request: Request, response: Response,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", max_length=64),
    actor: User = Depends(require_super_admin),
    db: Session = Depends(get_db_or_503), settings: Settings = Depends(get_settings),
):
    """Recharge or deduct VIRTUAL funds. A reason is mandatory. Send an Idempotency-Key so a
    retried/double-clicked request cannot apply twice."""
    target = _any_user(db, user_id)
    if target.deleted_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": "deleted", "message": "Account has been deleted"})
    try:
        tx, created = wallets.admin_adjust(
            db, target=target, actor=actor, kind=body.kind, amount=body.amount, reason=body.reason,
            idempotency_key=idempotency_key, ip=client_ip(request, settings),
        )
    except (wallets.InsufficientFunds, wallets.IdempotencyConflict) as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, {"code": exc.code, "message": str(exc)})
    except wallets.WalletError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, {"code": exc.code, "message": str(exc)})
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return tx


# --- per-user trading views -------------------------------------------------------------
@router.get("/users/{user_id}/orders", response_model=list[OrderOut])
def user_orders(user_id: int, limit: int = Limit, offset: int = Offset, db: Session = Depends(get_db_or_503)):
    _any_user(db, user_id)
    return db.scalars(select(PaperOrder).where(PaperOrder.user_id == user_id)
                      .order_by(PaperOrder.created_at.desc(), PaperOrder.id.desc()).limit(limit).offset(offset)).all()


@router.get("/users/{user_id}/trades", response_model=list[TradeOut])
def user_trades(user_id: int, limit: int = Limit, offset: int = Offset, db: Session = Depends(get_db_or_503)):
    _any_user(db, user_id)
    return db.scalars(select(PaperTrade).where(PaperTrade.user_id == user_id)
                      .order_by(PaperTrade.opened_at.desc(), PaperTrade.id.desc()).limit(limit).offset(offset)).all()


@router.get("/users/{user_id}/positions", response_model=list[PositionOut])
def user_positions(user_id: int, db: Session = Depends(get_db_or_503)):
    _any_user(db, user_id)
    return paper.positions(db, user_id)


@router.get("/users/{user_id}/performance")
def user_performance(user_id: int, db: Session = Depends(get_db_or_503)):
    _any_user(db, user_id)
    out = paper.performance(db, user_id)
    db.commit()
    return out


@router.get("/users/{user_id}/activity", response_model=list[AuditOut])
def user_activity(user_id: int, limit: int = Limit, offset: int = Offset, db: Session = Depends(get_db_or_503)):
    _any_user(db, user_id)
    return db.scalars(select(AuditLog).where(AuditLog.actor_user_id == user_id)
                      .order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit).offset(offset)).all()


# --- audit log --------------------------------------------------------------------------
@router.get("/audit-logs", response_model=list[AuditOut])
def audit_logs(
    action: str | None = Query(default=None, max_length=48),
    actor_user_id: int | None = None,
    limit: int = Limit, offset: int = Offset,
    db: Session = Depends(get_db_or_503),
):
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if actor_user_id is not None:
        stmt = stmt.where(AuditLog.actor_user_id == actor_user_id)
    return db.scalars(stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit).offset(offset)).all()
