"""Tests for the pre-production hardening fixes:
trusted-proxy client IP, mandatory Upstox account binding in production, fresh-row fills,
reservation release on soft delete, and strict idempotency."""

import os
import subprocess
import sys
import threading
from decimal import Decimal as D

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.core.clientip import parse_forwarded, resolve_client
from app.core.config import ConfigurationError, Settings, assert_production_ready, get_settings
from app.main import app
from app.models.audit_log import AuditLog
from app.models.enums import OrderStatus, UserRole, WalletTxType
from app.models.login_attempt import LoginAttempt
from app.models.paper_order import PaperOrder
from app.models.paper_trade import PaperTrade
from app.models.user import User
from app.models.wallet import Wallet, WalletTransaction
from app.services import paper
from app.services import users as user_service
from app.services import wallet as wallet_service
from tests.conftest import (
    OTHER_PW, STRONG_PW, build_engine, login, make_user, new_client, place,
)

API = "/api/v1"
requires_pg = pytest.mark.skipif(not os.environ.get("TEST_DATABASE_URL"), reason="needs PostgreSQL (TEST_DATABASE_URL)")


def configure(monkeypatch, **env):
    for k, v in env.items():
        monkeypatch.setenv(k, str(v))
    get_settings.cache_clear()
    return get_settings()


def peer_client(client, peer):  # `client` fixture installs the DB override on the shared app
    return TestClient(app, follow_redirects=False, client=(peer, 5000))


def fail_login(c, username, xff=None, secret=None):
    headers = {}
    if xff:
        headers["X-Forwarded-For"] = xff
    if secret:
        headers["X-Proxy-Secret"] = secret
    return c.post(f"{API}/auth/login", json={"identifier": username, "password": "Wrong-Password-1!"}, headers=headers)


# =====================================================================================
# 1. Trusted-proxy client IP
# =====================================================================================
def cfg(**kw):
    return Settings(_env_file=None, **kw)


def test_hops_zero_never_reads_forwarding_headers():
    s = cfg(trusted_proxy_hops=0)
    who = resolve_client("8.8.4.4", "1.2.3.4, 5.6.7.8", None, s)
    assert (who.address, who.throttle_key, who.source) == ("8.8.4.4", "8.8.4.4", "peer")  # public peer = the client


def test_private_peer_without_trust_gets_no_ip_bucket():
    """A private/loopback peer is a proxy, not a user: do not pool every user into one IP bucket."""
    s = cfg(trusted_proxy_hops=0)
    for peer in ("10.1.2.3", "127.0.0.1", "172.16.0.9", "100.64.0.1", "fd00::1"):
        who = resolve_client(peer, "9.9.9.9", None, s)
        assert who.throttle_key is None and who.source == "unverified" and who.address == peer


def test_client_is_nth_entry_from_the_right_and_left_forgeries_are_ignored():
    s = cfg(trusted_proxy_hops=2)
    real = "198.51.100.7"
    for forged in ("", "1.1.1.1, ", "1.1.1.1, 2.2.2.2, ", "6.6.6.6, "):
        header = f"{forged}{real}, 10.9.9.9"  # proxies appended: client, then proxy1
        who = resolve_client("10.0.0.5", header, None, s)
        assert who.address == real and who.source == "forwarded", header


def test_fails_closed_on_short_or_malformed_chains():
    s = cfg(trusted_proxy_hops=2)
    for header in ("198.51.100.7", "", None, "not-an-ip, 10.9.9.9", "198.51.100.7, <script>", "198.51.100.7:99, 10.9.9.9"):
        who = resolve_client("10.0.0.5", header, None, s)
        assert who.source == "unverified" and who.throttle_key is None, header
    assert parse_forwarded("1.2.3.4, bogus") is None


def test_peer_network_and_shared_secret_are_enforced_when_configured():
    header = "198.51.100.7, 10.9.9.9"
    s = cfg(trusted_proxy_hops=2, trusted_proxy_cidrs=["10.0.0.0/8"])
    assert resolve_client("10.0.0.5", header, None, s).source == "forwarded"
    assert resolve_client("8.8.4.4", header, None, s).source == "peer"  # direct hit from outside: header ignored
    s2 = cfg(trusted_proxy_hops=2, trusted_proxy_secret="s3cret-value")
    assert resolve_client("10.0.0.5", header, "s3cret-value", s2).source == "forwarded"
    assert resolve_client("10.0.0.5", header, "wrong", s2).source == "unverified"
    assert resolve_client("10.0.0.5", header, None, s2).source == "unverified"
    bad = cfg(trusted_proxy_hops=2, trusted_proxy_cidrs=["not-a-cidr"])
    assert resolve_client("10.0.0.5", header, None, bad).source == "unverified"  # misconfiguration fails closed


def test_rotating_forged_xff_cannot_bypass_ip_throttle_when_peer_is_the_client(client, db, monkeypatch):
    configure(monkeypatch, TRUSTED_PROXY_HOPS=0)
    c = peer_client(client, "8.8.4.4")  # directly internet-facing, headers must be ignored
    codes = [fail_login(c, f"ghost{i}", xff=f"203.0.113.{i}, 198.51.100.{i}").status_code for i in range(40)]
    assert codes.count(401) == 30 and set(codes[30:]) == {429}, codes  # blocked after 30 despite 40 distinct forged IPs


def test_hops_zero_behind_a_proxy_has_no_shared_lockout_but_keeps_per_account_throttling(client, db, monkeypatch):
    configure(monkeypatch, TRUSTED_PROXY_HOPS=0)
    make_user(db, "alice")
    c = peer_client(client, "10.0.0.5")  # the platform proxy as seen by the app
    # 40 failed logins for 40 different accounts do NOT lock everyone out through a shared IP bucket
    assert {fail_login(c, f"ghost{i}").status_code for i in range(40)} == {401}
    assert login(c, "alice").status_code == 200  # a legitimate user is unaffected
    # per-account throttling still protects a single account
    codes = [fail_login(c, "victim-account").status_code for _ in range(7)]
    assert codes[:5] == [401] * 5 and codes[5:] == [429, 429]


def test_behind_trusted_proxy_each_client_is_its_own_ip_and_forgery_is_useless(client, db, monkeypatch):
    configure(monkeypatch, TRUSTED_PROXY_HOPS=2)
    make_user(db, "alice")
    proxy = peer_client(client, "10.0.0.5")
    attacker = "198.51.100.50"
    # the attacker rotates forged left-hand entries; the trusted part (last two) never changes
    codes = [fail_login(proxy, f"ghost{i}", xff=f"1.1.1.{i}, 9.9.9.{i}, {attacker}, 10.9.9.9").status_code for i in range(40)]
    assert codes.count(401) == 30 and set(codes[30:]) == {429}, codes
    # a legitimate user behind the same proxy is NOT treated as the same IP
    ok = proxy.post(f"{API}/auth/login", json={"identifier": "alice", "password": STRONG_PW},
                    headers={"X-Forwarded-For": "198.51.100.77, 10.9.9.9"})
    assert ok.status_code == 200
    # and 40 different clients, one failure each, never trip the per-IP limit
    many = [fail_login(proxy, f"stranger{i}", xff=f"192.0.2.{i + 1}, 10.9.9.9").status_code for i in range(40)]
    assert set(many) == {401}
    # the recorded address is the derived client, not the proxy and not a forged value
    ips = {a.ip_address for a in db.scalars(select(LoginAttempt)).all()}
    assert attacker in ips and "198.51.100.77" in ips and "10.0.0.5" not in ips and "1.1.1.0" not in ips


def test_untrusted_header_chain_behind_proxy_fails_closed(client, db, monkeypatch):
    configure(monkeypatch, TRUSTED_PROXY_HOPS=3)
    proxy = peer_client(client, "10.0.0.5")
    # chain shorter than configured (e.g. a request that bypassed the first proxy): header ignored
    codes = [fail_login(proxy, f"ghost{i}", xff=f"198.51.100.{i}, 10.9.9.9").status_code for i in range(40)]
    assert set(codes) == {401}  # no per-IP bucket, no spoofable identity, no shared lockout
    ips = {a.ip_address for a in db.scalars(select(LoginAttempt)).all()}
    assert ips == {"10.0.0.5"}  # only the real TCP peer is recorded


def test_diagnostic_endpoint_is_super_admin_only_and_shows_the_chain(sa_client, client, db, monkeypatch):
    configure(monkeypatch, TRUSTED_PROXY_HOPS=2)
    r = sa_client.get(f"{API}/admin/diagnostics/client-ip", headers={"X-Forwarded-For": "198.51.100.7, 10.9.9.9"})
    body = r.json()
    assert r.status_code == 200 and body["x_forwarded_for_as_received"] == ["198.51.100.7", "10.9.9.9"]
    assert body["trusted_proxy_hops"] == 2 and "how_to_use" in body
    make_user(db, "alice")
    plain = new_client()
    login(plain, "alice")
    assert plain.get(f"{API}/admin/diagnostics/client-ip").status_code == 403


# =====================================================================================
# 2. Production Upstox binding
# =====================================================================================
FULL = dict(upstox_client_id="id-1", upstox_client_secret="very-secret-value", upstox_redirect_uri="https://x/cb",
            upstox_token_encryption_key="k" * 44, upstox_allowed_user_id="U123")


def test_production_refuses_enabled_upstox_without_allowed_user():
    for missing in ("upstox_allowed_user_id", "upstox_client_secret", "upstox_token_encryption_key", "upstox_redirect_uri"):
        s = cfg(app_env="production", **{**FULL, missing: ""})
        with pytest.raises(ConfigurationError) as exc:
            assert_production_ready(s)
        assert missing.upper() in str(exc.value)
        assert "very-secret-value" not in str(exc.value)  # never echoes secret values


def test_production_accepts_complete_or_disabled_upstox():
    assert_production_ready(cfg(app_env="production", **FULL))
    off = {k: "" for k in FULL}
    assert_production_ready(cfg(app_env="production", **off))  # integration disabled entirely


def test_development_and_test_stay_configurable():
    for env in ("development", "test"):
        assert_production_ready(cfg(app_env=env, **{**FULL, "upstox_allowed_user_id": ""}))


def test_get_settings_refuses_to_build_in_production(monkeypatch):
    configure_env = {"APP_ENV": "production", "UPSTOX_CLIENT_ID": "id-1", "UPSTOX_CLIENT_SECRET": "s",
                     "UPSTOX_REDIRECT_URI": "https://x/cb", "UPSTOX_TOKEN_ENCRYPTION_KEY": "k" * 44,
                     "UPSTOX_ALLOWED_USER_ID": ""}
    for k, v in configure_env.items():
        monkeypatch.setenv(k, v)
    get_settings.cache_clear()
    with pytest.raises(ConfigurationError):
        get_settings()


def _boot(env_overrides):
    env = dict(os.environ, PYTHONPATH=".", DATABASE_URL="", **env_overrides)
    return subprocess.run([sys.executable, "-c", "import app.main; print('BOOT_OK')"], env=env, capture_output=True, text=True)


def test_application_process_refuses_to_start_in_production_without_allowed_user():
    base = {"APP_ENV": "production", "UPSTOX_CLIENT_ID": "id-1", "UPSTOX_CLIENT_SECRET": "very-secret-value",
            "UPSTOX_REDIRECT_URI": "https://x/cb", "UPSTOX_TOKEN_ENCRYPTION_KEY": "k" * 44}
    bad = _boot({**base, "UPSTOX_ALLOWED_USER_ID": ""})
    assert bad.returncode != 0 and "BOOT_OK" not in bad.stdout
    assert "UPSTOX_ALLOWED_USER_ID" in bad.stderr and "very-secret-value" not in bad.stderr + bad.stdout
    good = _boot({**base, "UPSTOX_ALLOWED_USER_ID": "U123"})
    assert good.returncode == 0 and "BOOT_OK" in good.stdout, good.stderr[-400:]
    dev = _boot({**base, "APP_ENV": "development", "UPSTOX_ALLOWED_USER_ID": ""})
    assert dev.returncode == 0 and "BOOT_OK" in dev.stdout


# =====================================================================================
# 3. Fills use fresh rows; deterministic race outcomes
# =====================================================================================
def reconcile(db, user_id):
    db.expire_all()
    w = db.scalar(select(Wallet).where(Wallet.user_id == user_id))
    txs = db.scalars(select(WalletTransaction).where(WalletTransaction.wallet_id == w.id).order_by(WalletTransaction.seq)).all()
    assert sum((t.amount for t in txs), D(0)) == w.available_balance
    assert sum((t.reserved_delta for t in txs), D(0)) == w.reserved_balance
    assert w.available_balance >= 0 and w.reserved_balance >= 0
    return w, txs


@pytest.fixture
def trader(db):
    return make_user(db, "alice", balance="10000")


def _pending_order(db, trader, instrument, key="k1"):
    o, _ = paper.place_order(db, get_settings(), trader, instrument_id=instrument.id, side="BUY", quantity=10,
                             limit_price=D("100"), idempotency_key=key)
    return o.id


def test_fill_does_not_act_on_a_stale_order_when_a_cancel_commits_while_waiting(db, factory, trader, instrument, monkeypatch):
    oid = _pending_order(db, trader, instrument)
    held = db.get(PaperOrder, oid)  # keep a strong reference: the identity map is weak, so the cached PENDING copy must stay alive
    assert held.status == OrderStatus.PENDING
    real, fired = wallet_service.lock_wallet, {"done": False}

    def lock_after_a_cancel_commits(session, uid):
        if not fired["done"]:
            fired["done"] = True
            with factory() as other:
                paper.cancel_order(other, other.get(User, uid), oid)  # commits before we get our lock
        return real(session, uid)

    monkeypatch.setattr(wallet_service, "lock_wallet", lock_after_a_cancel_commits)
    with pytest.raises(paper.PaperTradingError) as exc:
        paper.fill_order(db, get_settings(), oid, D("99"))
    assert exc.value.code == "not_fillable"  # a clean domain error, never InsufficientFunds
    db.expire_all()
    assert db.get(PaperOrder, oid).status == OrderStatus.CANCELLED
    w, _ = reconcile(db, trader.id)
    assert (w.available_balance, w.reserved_balance) == (D("10000"), D("0"))
    assert db.query(PaperTrade).count() == 0


def test_second_fill_after_a_concurrent_fill_is_a_no_op(db, factory, trader, instrument, monkeypatch):
    oid = _pending_order(db, trader, instrument)
    held = db.get(PaperOrder, oid)  # strong reference keeps the cached copy alive (stale-row trap)
    assert held.status == OrderStatus.PENDING
    real, fired = wallet_service.lock_wallet, {"done": False}

    def lock_after_other_fill(session, uid):
        if not fired["done"]:
            fired["done"] = True
            with factory() as other:
                paper.fill_order(other, get_settings(), oid, D("99"))
        return real(session, uid)

    monkeypatch.setattr(wallet_service, "lock_wallet", lock_after_other_fill)
    again = paper.fill_order(db, get_settings(), oid, D("99"))
    assert again.status == OrderStatus.FILLED
    assert db.query(PaperTrade).count() == 1
    w, txs = reconcile(db, trader.id)
    assert w.reserved_balance == 0 and sum(1 for t in txs if t.type == WalletTxType.TRADE_BUY and t.amount == 0) == 1


def test_cancel_of_a_filled_order_and_fill_of_a_rejected_order_are_clean_errors(db, trader, instrument):
    oid = _pending_order(db, trader, instrument)
    paper.fill_order(db, get_settings(), oid, D("100"))
    with pytest.raises(paper.PaperTradingError) as e1:
        paper.cancel_order(db, trader, oid)
    assert e1.value.code == "not_cancellable"
    o2 = _pending_order(db, trader, instrument, "k2")
    paper.reject_order(db, o2, trader.id, "halted", trader)
    with pytest.raises(paper.PaperTradingError) as e2:
        paper.fill_order(db, get_settings(), o2, D("100"))
    assert e2.value.code == "not_fillable"
    reconcile(db, trader.id)


def _threads(n, fn):
    barrier, out = threading.Barrier(n), [None] * n

    def run(i):
        try:
            barrier.wait()
            out[i] = fn(i)
        except paper.PaperTradingError as exc:
            out[i] = f"domain:{exc.code}"
        except Exception as exc:  # noqa: BLE001  any other exception is a failure of the test
            out[i] = f"UNEXPECTED:{type(exc).__name__}"

    ts = [threading.Thread(target=run, args=(i,)) for i in range(n)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    return out


@requires_pg
def test_pg_cancel_vs_fill_race_is_deterministic(tmp_path):
    engine = build_engine(str(tmp_path / "x.db"))
    F = sessionmaker(bind=engine, expire_on_commit=False)
    with F() as s:
        user = make_user(s, "racer", balance="100000")
        from app.models.instrument import Instrument
        s.add(Instrument(symbol="X", exchange="NSE", is_active=True, instrument_type="EQ"))
        s.commit()
        uid = user.id
    settings = get_settings()
    for rnd in range(12):
        with F() as s:
            oid = paper.place_order(s, settings, s.get(User, uid), instrument_id=1, side="BUY", quantity=10,
                                    limit_price=D("100"), idempotency_key=f"r{rnd}")[0].id

        def act(i):
            with F() as s:
                if i == 0:
                    return "cancelled" if paper.cancel_order(s, s.get(User, uid), oid).status == OrderStatus.CANCELLED else "?"
                return "filled" if paper.fill_order(s, settings, oid, D("99")).status == OrderStatus.FILLED else "?"

        a, b = _threads(2, act)
        assert (a, b) in {("cancelled", "domain:not_fillable"), ("domain:not_cancellable", "filled")}, (a, b)
        with F() as s:
            order = s.get(PaperOrder, oid)
            lots = s.query(PaperTrade).filter_by(entry_order_id=oid).count()
            assert (order.status == OrderStatus.FILLED and lots == 1) or (order.status == OrderStatus.CANCELLED and lots == 0)
    with F() as s:
        w, _ = reconcile(s, uid)
        assert w.reserved_balance == 0


@requires_pg
def test_pg_duplicate_concurrent_fills_apply_exactly_once(tmp_path):
    engine = build_engine(str(tmp_path / "x.db"))
    F = sessionmaker(bind=engine, expire_on_commit=False)
    with F() as s:
        user = make_user(s, "racer", balance="50000")
        from app.models.instrument import Instrument
        s.add(Instrument(symbol="X", exchange="NSE", is_active=True, instrument_type="EQ"))
        s.commit()
        uid = user.id
    settings = get_settings()
    with F() as s:
        oid = paper.place_order(s, settings, s.get(User, uid), instrument_id=1, side="BUY", quantity=10,
                                limit_price=D("100"), idempotency_key="dup")[0].id

    def fill(i):
        with F() as s:
            return paper.fill_order(s, settings, oid, D("100")).status.value

    results = _threads(8, fill)
    assert results == ["FILLED"] * 8, results  # every duplicate returns the same safe result
    with F() as s:
        assert s.query(PaperTrade).filter_by(entry_order_id=oid).count() == 1
        w, txs = reconcile(s, uid)
        assert w.available_balance == D("50000") - D("1000.3") and w.reserved_balance == 0
        assert sum(1 for t in txs if t.paper_order_id == oid and t.type == WalletTxType.TRADE_CHARGE) == 1


@requires_pg
def test_pg_soft_delete_racing_a_fill_keeps_the_ledger_correct(tmp_path):
    engine = build_engine(str(tmp_path / "x.db"))
    F = sessionmaker(bind=engine, expire_on_commit=False)
    settings = get_settings()
    from app.models.instrument import Instrument
    with F() as s:
        sa = make_user(s, "root", UserRole.SUPER_ADMIN)
        s.add(Instrument(symbol="X", exchange="NSE", is_active=True, instrument_type="EQ"))
        s.commit()
        sa_id = sa.id
    for rnd in range(8):
        with F() as s:
            target = make_user(s, f"victim{rnd}", balance="10000")
            tid = target.id
            oid = paper.place_order(s, settings, s.get(User, tid), instrument_id=1, side="BUY", quantity=10,
                                    limit_price=D("100"), idempotency_key="k")[0].id

        def act(i, tid=tid, oid=oid):
            with F() as s:
                if i == 0:
                    user_service.soft_delete(s, s.get(User, sa_id), s.get(User, tid))
                    return "deleted"
                return paper.fill_order(s, settings, oid, D("100")).status.value.lower()

        a, b = _threads(2, act)
        assert a == "deleted" and b in ("filled", "domain:not_fillable"), (a, b)
        with F() as s:
            w, _ = reconcile(s, tid)
            assert w.reserved_balance == 0  # whichever won, nothing is left reserved
            assert s.get(User, tid).deleted_at is not None


# =====================================================================================
# 4. Soft delete releases reservations atomically
# =====================================================================================
def _setup_deleted_candidate(sa_client, db, instrument):
    uid = sa_client.post(f"{API}/admin/users", json={"username": "doomed", "email": "d@example.com", "password": STRONG_PW,
                                                     "initial_balance": "10000"}).json()["user"]["id"]
    c = new_client()
    login(c, "doomed")
    c.post(f"{API}/auth/change-password", json={"current_password": STRONG_PW, "new_password": OTHER_PW})
    filled = place(c, instrument.id, "f1", qty=2, price="50.00").json()["id"]
    paper.fill_order(db, get_settings(), filled, D("50"))
    p1 = place(c, instrument.id, "p1", qty=10, price="100.00").json()["id"]
    p2 = place(c, instrument.id, "p2", qty=5, price="20.00").json()["id"]
    return uid, c, filled, p1, p2


def test_soft_delete_releases_pending_reservations_in_the_ledger(sa_client, db, instrument, superadmin):
    uid, c, filled, p1, p2 = _setup_deleted_candidate(sa_client, db, instrument)
    before, _ = reconcile(db, uid)
    assert before.reserved_balance == D("1000.3") + D("100.03")
    n_tx_before = db.query(WalletTransaction).filter_by(user_id=uid).count()

    assert sa_client.delete(f"{API}/admin/users/{uid}").status_code == 204
    w, txs = reconcile(db, uid)
    assert w.reserved_balance == 0  # everything released
    assert w.available_balance == before.available_balance + before.reserved_balance
    refunds = [t for t in txs if t.type == WalletTxType.TRADE_REFUND and t.paper_order_id in (p1, p2)]
    assert {t.paper_order_id for t in refunds} == {p1, p2} and len(refunds) == 2
    assert all(t.actor_user_id == superadmin.id and "account deleted" in t.description.lower() for t in refunds)
    assert db.query(WalletTransaction).filter_by(user_id=uid).count() == n_tx_before + 2  # append-only: only additions
    # history preserved: orders kept (pending ones now CANCELLED), the filled order and its lot untouched
    db.expire_all()
    assert db.get(PaperOrder, filled).status == OrderStatus.FILLED
    assert {db.get(PaperOrder, i).status for i in (p1, p2)} == {OrderStatus.CANCELLED}
    assert db.get(PaperOrder, p1).status_reason == "Account deleted" and db.get(PaperOrder, p1).reserved_amount == 0
    assert db.query(PaperTrade).filter_by(user_id=uid).count() == 1
    log = db.scalar(select(AuditLog).where(AuditLog.action == "USER_DELETED"))
    assert log.details["pending_orders_cancelled"] == 2 and log.details["reserved_funds_released"] == "1100.3300"
    assert c.get(f"{API}/auth/me").status_code == 401


def test_reservation_cannot_be_released_twice(sa_client, db, instrument):
    uid, _c, _f, p1, p2 = _setup_deleted_candidate(sa_client, db, instrument)
    assert sa_client.delete(f"{API}/admin/users/{uid}").status_code == 204
    snapshot = db.query(WalletTransaction).filter_by(user_id=uid).count()
    assert sa_client.delete(f"{API}/admin/users/{uid}").status_code == 409  # already deleted
    root = db.scalar(select(User).where(User.role == UserRole.SUPER_ADMIN))
    assert paper.cancel_all_pending(db, uid, root, "again") == (0, D("0"))  # direct second call is a no-op
    db.commit()
    assert db.query(WalletTransaction).filter_by(user_id=uid).count() == snapshot
    reconcile(db, uid)


def test_soft_delete_is_atomic_if_anything_fails_midway(sa_client, db, instrument, factory, monkeypatch):
    uid, c, _f, p1, p2 = _setup_deleted_candidate(sa_client, db, instrument)
    snapshot = db.query(WalletTransaction).filter_by(user_id=uid).count()
    boom = RuntimeError("simulated failure after funds were released")
    real = paper.audit.record

    def failing(session, action, **kw):
        if action == "USER_DELETED":
            raise boom
        return real(session, action, **kw)

    monkeypatch.setattr(paper.audit, "record", failing)
    with factory() as s:
        root = s.scalar(select(User).where(User.role == UserRole.SUPER_ADMIN))
        with pytest.raises(RuntimeError):
            user_service.soft_delete(s, root, s.get(User, uid))
        s.rollback()
    monkeypatch.setattr(paper.audit, "record", real)
    db.expire_all()
    target = db.get(User, uid)
    assert target.deleted_at is None and target.is_active  # the delete did not happen...
    assert {db.get(PaperOrder, i).status for i in (p1, p2)} == {OrderStatus.PENDING}  # ...nor the cancellations
    assert db.query(WalletTransaction).filter_by(user_id=uid).count() == snapshot  # ...nor any ledger release
    w, _ = reconcile(db, uid)
    assert w.reserved_balance == D("1100.33")
    assert c.get(f"{API}/auth/me").status_code == 200  # sessions were not revoked either


def test_a_deleted_or_deactivated_account_cannot_place_new_orders(db, trader, instrument):
    user_service.soft_delete(db, make_user(db, "root", UserRole.SUPER_ADMIN), trader)
    with pytest.raises(paper.PaperTradingError) as exc:
        paper.place_order(db, get_settings(), trader, instrument_id=instrument.id, side="BUY", quantity=1,
                          limit_price=D("1"), idempotency_key="late")  # request that was in flight during the delete
    assert exc.value.code == "account_inactive"
    assert db.query(PaperOrder).count() == 0


# =====================================================================================
# 5. Idempotency: same key + different details -> 409
# =====================================================================================
def test_wallet_adjustment_key_reuse_with_different_details_is_409(sa_client, db):
    a = make_user(db, "alice", balance="1000")
    url = f"{API}/admin/wallets/{a.id}/adjust"
    base = {"kind": "RECHARGE", "amount": "100.00", "reason": "monthly top-up"}
    h = {"Idempotency-Key": "adj-key"}
    first = sa_client.post(url, json=base, headers=h)
    assert first.status_code == 201
    same = sa_client.post(url, json=base, headers=h)  # identical retry stays idempotent
    assert same.status_code == 200 and same.json()["id"] == first.json()["id"]
    for changed in ({**base, "amount": "100.01"}, {**base, "reason": "something else"}, {**base, "kind": "DEDUCT"},
                    {**base, "amount": "999.00"}):
        r = sa_client.post(url, json=changed, headers=h)
        assert r.status_code == 409 and r.json()["detail"]["code"] == "idempotency_conflict", changed
    w = db.scalar(select(Wallet).where(Wallet.user_id == a.id))
    db.refresh(w)
    assert w.available_balance == D("1100")  # applied exactly once
    assert db.query(WalletTransaction).filter_by(user_id=a.id).count() == 2  # initial credit + the one recharge
    # the same key on a different wallet is independent
    b = make_user(db, "bobby", balance="0")
    assert sa_client.post(f"{API}/admin/wallets/{b.id}/adjust", json=base, headers=h).status_code == 201


def test_order_key_reuse_with_different_details_is_409(client, db, trader, instrument):
    from app.models.instrument import Instrument
    other = Instrument(symbol="OTHER", exchange="NSE", is_active=True, instrument_type="EQ")
    db.add(other)
    db.commit()
    login(client, "alice")
    first = place(client, instrument.id, "same-key", qty=10, price="100.00")
    assert first.status_code == 200
    again = place(client, instrument.id, "same-key", qty=10, price="100.00")
    assert again.status_code == 200 and again.json()["id"] == first.json()["id"]  # identical retry
    for kwargs in ({"qty": 11}, {"price": "100.01"}, {"side": "SELL"}):
        r = place(client, instrument.id, "same-key", **{"qty": 10, "price": "100.00", **kwargs})
        assert r.status_code == 409 and r.json()["detail"]["code"] == "idempotency_conflict", kwargs
    r = place(client, other.id, "same-key", qty=10, price="100.00")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "idempotency_conflict"
    assert db.query(PaperOrder).count() == 1
    w, _ = reconcile(db, trader.id)
    assert (w.available_balance, w.reserved_balance) == (D("8999.7"), D("1000.3"))  # reserved once


def test_a_rejected_order_retry_is_idempotent_but_changed_retry_conflicts(client, db, trader, instrument):
    login(client, "alice")
    big = place(client, instrument.id, "big", qty=100000, price="100.00")
    assert big.status_code == 409 and big.json()["detail"]["code"] == "order_rejected"
    assert place(client, instrument.id, "big", qty=100000, price="100.00").json()["detail"]["code"] == "order_rejected"
    changed = place(client, instrument.id, "big", qty=1, price="1.00")
    assert changed.status_code == 409 and changed.json()["detail"]["code"] == "idempotency_conflict"
    assert db.query(PaperOrder).count() == 1
