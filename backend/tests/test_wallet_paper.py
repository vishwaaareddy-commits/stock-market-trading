import threading
from decimal import Decimal as D

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db.base import Base
from app.models.enums import OrderStatus, TradeStatus, UserRole
from app.models.instrument import Instrument
from app.models.paper_order import PaperOrder
from app.models.paper_trade import PaperTrade
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.services import paper
from app.services import wallet as wallet_service
from tests.conftest import build_engine, login, make_user, new_client, place

API = "/api/v1"
Q = D("0.0001")


def wallet_of(db, user_id) -> Wallet:
    db.expire_all()
    return db.scalar(select(Wallet).where(Wallet.user_id == user_id))


def assert_ledger_reconciles(db, user_id):
    """Balances must equal the ledger, and every entry must chain from the previous one."""
    db.expire_all()
    w = wallet_of(db, user_id)
    txs = db.scalars(select(WalletTransaction).where(WalletTransaction.wallet_id == w.id)
                     .order_by(WalletTransaction.seq)).all()
    assert sum((t.amount for t in txs), D(0)) == w.available_balance
    assert sum((t.reserved_delta for t in txs), D(0)) == w.reserved_balance
    for t in txs:
        assert t.available_after - t.available_before == t.amount
        assert t.reserved_after - t.reserved_before == t.reserved_delta
    assert w.available_balance >= 0 and w.reserved_balance >= 0


# --- wallets & Super Admin adjustments -------------------------------------------------
def test_every_account_has_its_own_wallet(db, superadmin):
    a = make_user(db, "alice", balance="1000")
    b = make_user(db, "bob", balance="2000")
    wallets = db.scalars(select(Wallet)).all()
    assert len({w.id for w in wallets}) == len(wallets) == 3  # super admin + 2 admins
    assert wallet_of(db, a.id).available_balance == D("1000")
    assert wallet_of(db, b.id).available_balance == D("2000")
    assert wallet_of(db, superadmin.id).available_balance == D("500000")


def test_super_admin_recharge_and_deduct_with_reason(sa_client, db):
    a = make_user(db, "alice", balance="1000")
    r = sa_client.post(f"{API}/admin/wallets/{a.id}/adjust", json={"kind": "RECHARGE", "amount": "250.50", "reason": "monthly top-up"})
    assert r.status_code == 201
    tx = r.json()
    assert tx["type"] == "ADMIN_RECHARGE" and tx["available_before"] == "1000.0000" and tx["available_after"] == "1250.5000"
    assert tx["description"] == "monthly top-up" and tx["actor_user_id"] is not None and tx["id"]

    d = sa_client.post(f"{API}/admin/wallets/{a.id}/adjust", json={"kind": "DEDUCT", "amount": "50.50", "reason": "correction"})
    assert d.status_code == 201 and d.json()["type"] == "ADMIN_ADJUSTMENT" and d.json()["amount"] == "-50.5000"
    assert wallet_of(db, a.id).available_balance == D("1200")
    assert_ledger_reconciles(db, a.id)


def test_adjustment_requires_reason_and_valid_amount(sa_client, db):
    a = make_user(db, "alice", balance="100")
    url = f"{API}/admin/wallets/{a.id}/adjust"
    assert sa_client.post(url, json={"kind": "RECHARGE", "amount": "10"}).status_code == 422  # reason missing
    assert sa_client.post(url, json={"kind": "RECHARGE", "amount": "10", "reason": " "}).status_code == 422
    assert sa_client.post(url, json={"kind": "RECHARGE", "amount": "0", "reason": "zero"}).status_code == 422
    assert sa_client.post(url, json={"kind": "RECHARGE", "amount": "-5", "reason": "negative"}).status_code == 422
    assert sa_client.post(url, json={"kind": "RECHARGE", "amount": "abc", "reason": "nan"}).status_code == 422
    assert wallet_of(db, a.id).available_balance == D("100")


def test_deduction_cannot_overdraw(sa_client, db):
    a = make_user(db, "alice", balance="100")
    r = sa_client.post(f"{API}/admin/wallets/{a.id}/adjust", json={"kind": "DEDUCT", "amount": "100.01", "reason": "too much"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "insufficient_funds"
    assert wallet_of(db, a.id).available_balance == D("100")
    assert db.query(WalletTransaction).filter_by(user_id=a.id).count() == 1  # only the initial credit


def test_adjustment_idempotency_key_prevents_double_credit(sa_client, db):
    a = make_user(db, "alice", balance="0")
    url, body, h = f"{API}/admin/wallets/{a.id}/adjust", {"kind": "RECHARGE", "amount": "500", "reason": "once only"}, {"Idempotency-Key": "abc-123"}
    first, second = sa_client.post(url, json=body, headers=h), sa_client.post(url, json=body, headers=h)
    assert first.status_code == 201 and second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    assert wallet_of(db, a.id).available_balance == D("500")
    assert db.query(WalletTransaction).filter_by(user_id=a.id).count() == 1


def test_user_sees_own_wallet_and_history_but_cannot_modify(client, db, superadmin):
    a = make_user(db, "alice", balance="1000")
    login(client, "alice")
    w = client.get(f"{API}/wallet").json()
    assert w["is_virtual"] is True and w["currency"] == "VIRTUAL_INR" and w["available_balance"] == "1000.0000"
    txs = client.get(f"{API}/wallet/transactions").json()
    assert [t["type"] for t in txs] == ["INITIAL_CREDIT"]
    for method in ("post", "put", "patch", "delete"):
        assert client.request(method.upper(), f"{API}/wallet", json={"available_balance": "999999"}).status_code in (404, 405)


def test_super_admin_has_and_trades_with_own_wallet(sa_client, db, instrument):
    assert sa_client.get(f"{API}/wallet").json()["available_balance"] == "500000.0000"
    assert place(sa_client, instrument.id, "sa-1", qty=10, price="100").status_code == 200
    assert sa_client.get(f"{API}/wallet").json()["reserved_balance"] == "1000.3000"


def test_ledger_entries_cannot_be_edited_in_application(db):
    from app.models.immutability import ImmutableRecordError
    user = make_user(db, "alice", balance="10")
    tx = db.scalar(select(WalletTransaction))
    tx.amount = D("99999")
    with pytest.raises(ImmutableRecordError):
        db.commit()
    db.rollback()
    assert wallet_of(db, user.id).available_balance == D("10")


# --- paper trading <-> wallet ----------------------------------------------------------
@pytest.fixture
def trader(db):
    return make_user(db, "alice", balance="10000")


@pytest.fixture
def settings():
    return get_settings()


def test_buy_reserves_then_fill_debits_exact_cost_and_refunds_leftover(client, db, trader, instrument, settings):
    login(client, "alice")
    r = place(client, instrument.id, "b1", qty=10, price="100")
    assert r.status_code == 200 and r.json()["status"] == "PENDING"
    w = wallet_of(db, trader.id)
    assert (w.available_balance, w.reserved_balance) == (D("8999.7"), D("1000.3"))  # 1000 + 0.03% charge

    order = paper.fill_order(db, settings, r.json()["id"], D("98"))  # filled below limit
    assert order.status == OrderStatus.FILLED and order.fill_price == D("98")
    w = wallet_of(db, trader.id)
    # paid 980 + 0.294 charges; the unused 20.006 of the reservation came back
    assert w.reserved_balance == D("0") and w.available_balance == D("10000") - D("980.294")
    types = [t.type.value for t in db.scalars(select(WalletTransaction).order_by(WalletTransaction.seq))]
    assert types == ["INITIAL_CREDIT", "TRADE_BUY", "TRADE_BUY", "TRADE_CHARGE", "TRADE_REFUND"]
    assert_ledger_reconciles(db, trader.id)
    lot = db.scalar(select(PaperTrade))
    assert lot.status == TradeStatus.OPEN and lot.quantity == 10 and lot.entry_price == D("98")
    assert client.get(f"{API}/paper/positions").json()[0]["quantity"] == 10


def test_sell_credits_proceeds_minus_charges_and_tracks_realized_pnl(client, db, trader, instrument, settings):
    login(client, "alice")
    paper.fill_order(db, settings, place(client, instrument.id, "b1", qty=10, price="100").json()["id"], D("98"))
    sell = place(client, instrument.id, "s1", side="SELL", qty=10, price="105")
    assert sell.status_code == 200
    before = wallet_of(db, trader.id).available_balance
    paper.fill_order(db, settings, sell.json()["id"], D("110"))
    w = wallet_of(db, trader.id)
    assert w.available_balance - before == D("1100") - D("0.33")  # proceeds - charges
    assert w.realized_pnl == D("120") - D("0.294") - D("0.33")  # (110-98)*10 less both legs' charges
    lot = db.scalar(select(PaperTrade))
    assert lot.status == TradeStatus.CLOSED and lot.pnl == w.realized_pnl and lot.exit_price == D("110")
    assert_ledger_reconciles(db, trader.id)
    perf = client.get(f"{API}/paper/performance").json()
    assert perf["closed_trades"] == 1 and perf["winning_trades"] == 1 and perf["open_positions"] == 0


def test_sell_closes_lots_fifo_and_splits_partial_lot(db, trader, instrument, settings):
    def buy(key, qty, price):
        o, _ = paper.place_order(db, settings, trader, instrument_id=instrument.id, side="BUY", quantity=qty,
                                 limit_price=D(price), idempotency_key=key)
        return paper.fill_order(db, settings, o.id, D(price))

    buy("b1", 10, "100")
    buy("b2", 5, "120")
    sell, _ = paper.place_order(db, settings, trader, instrument_id=instrument.id, side="SELL", quantity=12,
                                limit_price=D("130"), idempotency_key="s1")
    paper.fill_order(db, settings, sell.id, D("130"))
    open_lots = db.scalars(select(PaperTrade).where(PaperTrade.status == TradeStatus.OPEN)).all()
    closed = db.scalars(select(PaperTrade).where(PaperTrade.status == TradeStatus.CLOSED).order_by(PaperTrade.id)).all()
    assert [(l.quantity, l.entry_price) for l in open_lots] == [(3, D("120"))]
    assert sorted(c.quantity for c in closed) == [2, 10]
    assert sum(c.pnl for c in closed) == wallet_of(db, trader.id).realized_pnl
    assert sum(c.exit_charge for c in closed) == D("1560") * D("0.0003")  # exit charge fully allocated
    assert_ledger_reconciles(db, trader.id)


def test_insufficient_funds_rejects_buy_without_debit(client, db, trader, instrument):
    login(client, "alice")
    r = place(client, instrument.id, "big", qty=1000, price="100")  # needs 100,030 virtual
    assert r.status_code == 409 and r.json()["detail"]["code"] == "order_rejected"
    assert r.json()["detail"]["order"]["status"] == "REJECTED"
    w = wallet_of(db, trader.id)
    assert (w.available_balance, w.reserved_balance) == (D("10000"), D("0"))
    assert db.query(WalletTransaction).filter_by(user_id=trader.id).count() == 1
    assert db.query(PaperOrder).one().status == OrderStatus.REJECTED  # kept for traceability
    # the identical retry returns the same rejected order rather than trying again
    again = place(client, instrument.id, "big", qty=1000, price="100")
    assert again.status_code == 409 and db.query(PaperOrder).count() == 1


def test_short_selling_is_not_allowed(client, db, trader, instrument):
    login(client, "alice")
    r = place(client, instrument.id, "s1", side="SELL", qty=5, price="100")
    assert r.status_code == 409 and "short" in r.json()["detail"]["message"].lower()
    assert wallet_of(db, trader.id).available_balance == D("10000")


def test_pending_sells_cannot_oversell_holdings(db, trader, instrument, settings):
    o, _ = paper.place_order(db, settings, trader, instrument_id=instrument.id, side="BUY", quantity=10,
                             limit_price=D("100"), idempotency_key="b1")
    paper.fill_order(db, settings, o.id, D("100"))
    s1, _ = paper.place_order(db, settings, trader, instrument_id=instrument.id, side="SELL", quantity=6,
                              limit_price=D("100"), idempotency_key="s1")
    s2, _ = paper.place_order(db, settings, trader, instrument_id=instrument.id, side="SELL", quantity=6,
                              limit_price=D("100"), idempotency_key="s2")
    assert (s1.status, s2.status) == (OrderStatus.PENDING, OrderStatus.REJECTED)


def test_cancel_releases_reserved_funds_and_is_idempotent(client, db, trader, instrument):
    login(client, "alice")
    oid = place(client, instrument.id, "c1", qty=10, price="100").json()["id"]
    assert wallet_of(db, trader.id).reserved_balance == D("1000.3")
    assert client.post(f"{API}/paper/orders/{oid}/cancel").json()["status"] == "CANCELLED"
    w = wallet_of(db, trader.id)
    assert (w.available_balance, w.reserved_balance) == (D("10000"), D("0"))
    assert client.post(f"{API}/paper/orders/{oid}/cancel").status_code == 200  # repeat is a no-op
    assert wallet_of(db, trader.id).available_balance == D("10000")
    refunds = db.query(WalletTransaction).filter_by(type=wallet_service.WalletTxType.TRADE_REFUND).count()
    assert refunds == 1
    assert_ledger_reconciles(db, trader.id)


def test_engine_rejection_releases_funds(db, trader, instrument, settings, superadmin):
    o, _ = paper.place_order(db, settings, trader, instrument_id=instrument.id, side="BUY", quantity=10,
                             limit_price=D("100"), idempotency_key="r1")
    paper.reject_order(db, o.id, trader.id, "Instrument halted", superadmin)
    db.refresh(o)
    assert o.status == OrderStatus.REJECTED and o.status_reason == "Instrument halted"
    assert wallet_of(db, trader.id).available_balance == D("10000")
    assert_ledger_reconciles(db, trader.id)


def test_cannot_cancel_filled_order(client, db, trader, instrument, settings):
    login(client, "alice")
    oid = place(client, instrument.id, "f1", qty=1, price="100").json()["id"]
    paper.fill_order(db, settings, oid, D("100"))
    assert client.post(f"{API}/paper/orders/{oid}/cancel").status_code == 409


def test_duplicate_order_request_does_not_double_debit(client, db, trader, instrument):
    login(client, "alice")
    first = place(client, instrument.id, "same-key", qty=10, price="100")
    second = place(client, instrument.id, "same-key", qty=10, price="100")
    assert first.json()["id"] == second.json()["id"]
    assert db.query(PaperOrder).count() == 1
    w = wallet_of(db, trader.id)
    assert (w.available_balance, w.reserved_balance) == (D("8999.7"), D("1000.3"))
    assert client.post(f"{API}/paper/orders", json={"instrument_id": instrument.id, "side": "BUY", "quantity": 1,
                                                      "limit_price": "1"}).status_code == 422  # key required


def test_duplicate_fill_does_not_double_credit(db, trader, instrument, settings):
    o, _ = paper.place_order(db, settings, trader, instrument_id=instrument.id, side="BUY", quantity=10,
                             limit_price=D("100"), idempotency_key="b1")
    paper.fill_order(db, settings, o.id, D("100"))
    snapshot = wallet_of(db, trader.id).available_balance
    paper.fill_order(db, settings, o.id, D("100"))  # duplicate delivery
    assert wallet_of(db, trader.id).available_balance == snapshot
    assert db.query(PaperTrade).count() == 1
    assert_ledger_reconciles(db, trader.id)


def test_fill_price_must_respect_limit(db, trader, instrument, settings):
    o, _ = paper.place_order(db, settings, trader, instrument_id=instrument.id, side="BUY", quantity=10,
                             limit_price=D("100"), idempotency_key="b1")
    with pytest.raises(paper.PaperTradingError):
        paper.fill_order(db, settings, o.id, D("100.01"))
    assert wallet_of(db, trader.id).reserved_balance == D("1000.3")  # nothing half-applied


def test_failed_operation_never_leaves_partial_wallet_changes(db, trader, instrument, settings, monkeypatch):
    """If anything fails after funds move, the whole transaction rolls back."""
    def boom(*a, **k):
        raise RuntimeError("simulated crash after reservation")

    monkeypatch.setattr(paper.audit, "record", boom)
    with pytest.raises(RuntimeError):
        paper.place_order(db, settings, trader, instrument_id=instrument.id, side="BUY", quantity=10,
                          limit_price=D("100"), idempotency_key="crash")
    db.rollback()
    w = wallet_of(db, trader.id)
    assert (w.available_balance, w.reserved_balance) == (D("10000"), D("0"))
    assert db.query(PaperOrder).count() == 0
    assert db.query(WalletTransaction).filter_by(user_id=trader.id).count() == 1


def test_unrealized_pnl_uses_last_candle_and_equity_is_separate(client, db, trader, instrument, settings):
    from datetime import datetime, timezone

    from app.models.candle import Candle

    login(client, "alice")
    paper.fill_order(db, settings, place(client, instrument.id, "b1", qty=10, price="100").json()["id"], D("100"))
    w = client.get(f"{API}/wallet").json()
    assert w["unrealized_pnl"] is None and w["equity_basis"] == "cost"  # no market price: not invented
    db.add(Candle(instrument_id=instrument.id, timeframe="15m", open_time=datetime(2026, 1, 1, tzinfo=timezone.utc),
                  open=D("100"), high=D("115"), low=D("99"), close=D("110"), volume=1000, source="test"))
    db.commit()
    w = client.get(f"{API}/wallet").json()
    assert w["unrealized_pnl"] == "100.0000" and w["realized_pnl"] == "0.0000" and w["equity_basis"] == "market"
    assert D(w["total_equity"]) == D("10000") - D("0.3") + D("100")  # cash + cost + unrealized, less charges


# --- concurrency -----------------------------------------------------------------------
def _file_db(tmp_path):
    engine = build_engine(str(tmp_path / "race.db"))
    return engine, sessionmaker(bind=engine, expire_on_commit=False)


def _run_threads(n, target):
    barrier, results, errors = threading.Barrier(n), [None] * n, []

    def worker(i):
        try:
            barrier.wait()
            results[i] = target(i)
        except Exception as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(n)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert not errors, errors
    return results


def test_concurrent_buys_cannot_overspend_wallet(tmp_path, settings):
    engine, Session_ = _file_db(tmp_path)
    with Session_() as s:
        user = make_user(s, "alice", balance="2500")
        s.add(Instrument(symbol="X", exchange="NSE", is_active=True, instrument_type="EQ"))
        s.commit()
        uid = user.id

    def attempt(i):
        with Session_() as s:
            u = s.get(User, uid)
            order, _ = paper.place_order(s, settings, u, instrument_id=1, side="BUY", quantity=10,
                                         limit_price=D("100"), idempotency_key=f"race-{i}")
            return order.status.value

    statuses = _run_threads(6, attempt)  # each needs 1000.3; only two fit in 2500
    assert sorted(statuses) == ["PENDING", "PENDING"] + ["REJECTED"] * 4
    with Session_() as s:
        w = s.scalar(select(Wallet).where(Wallet.user_id == uid))
        assert w.reserved_balance == D("2000.6") and w.available_balance == D("499.4")
        assert_ledger_reconciles(s, uid)


def test_concurrent_duplicate_requests_create_one_order(tmp_path, settings):
    engine, Session_ = _file_db(tmp_path)
    with Session_() as s:
        user = make_user(s, "alice", balance="5000")
        s.add(Instrument(symbol="X", exchange="NSE", is_active=True, instrument_type="EQ"))
        s.commit()
        uid = user.id

    def attempt(_):
        with Session_() as s:
            order, _created = paper.place_order(s, settings, s.get(User, uid), instrument_id=1, side="BUY",
                                                quantity=10, limit_price=D("100"), idempotency_key="one-key")
            return order.id

    ids = _run_threads(5, attempt)
    assert len(set(ids)) == 1
    with Session_() as s:
        assert s.query(PaperOrder).count() == 1
        w = s.scalar(select(Wallet).where(Wallet.user_id == uid))
        assert (w.available_balance, w.reserved_balance) == (D("3999.7"), D("1000.3"))
        assert_ledger_reconciles(s, uid)


def test_concurrent_admin_adjustments_with_same_key_apply_once(tmp_path):
    engine, Session_ = _file_db(tmp_path)
    with Session_() as s:
        sa = make_user(s, "root", UserRole.SUPER_ADMIN)
        target = make_user(s, "alice")
        sa_id, tid = sa.id, target.id

    def attempt(_):
        with Session_() as s:
            tx, _created = wallet_service.admin_adjust(s, target=s.get(User, tid), actor=s.get(User, sa_id), kind="RECHARGE",
                                                       amount=D("100"), reason="double click", idempotency_key="dbl")
            return tx.id

    assert len(set(_run_threads(5, attempt))) == 1
    with Session_() as s:
        assert s.scalar(select(Wallet).where(Wallet.user_id == tid)).available_balance == D("100")


def test_money_is_decimal_end_to_end(db, trader, instrument, settings):
    o, _ = paper.place_order(db, settings, trader, instrument_id=instrument.id, side="BUY", quantity=3,
                             limit_price=D("33.33"), idempotency_key="d1")
    assert isinstance(o.reserved_amount, D) and isinstance(wallet_of(db, trader.id).available_balance, D)
    assert o.reserved_amount == D("99.99") + (D("99.99") * D("0.0003")).quantize(Q)
