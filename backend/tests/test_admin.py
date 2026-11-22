import json
from datetime import timedelta

import pytest
from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.enums import UserRole
from app.models.user import User
from app.models.wallet import WalletTransaction
from app.services import auth as auth_service
from tests.conftest import OTHER_PW, STRONG_PW, login, make_user, new_client, place

API = "/api/v1"


def create_admin(c, username="alice", balance="1000.00", password=None):
    body = {"username": username, "email": f"{username}@example.com", "display_name": username.title(),
            "initial_balance": balance}
    if password:
        body["password"] = password
    return c.post(f"{API}/admin/users", json=body)


# --- permissions ----------------------------------------------------------------------
ADMIN_ENDPOINTS = [
    ("get", "/admin/dashboard", None), ("get", "/admin/users", None), ("get", "/admin/users/1", None),
    ("post", "/admin/users", {"username": "x1x", "email": "x@example.com"}),
    ("patch", "/admin/users/1", {"display_name": "x"}),
    ("post", "/admin/users/1/reset-password", {}), ("post", "/admin/users/1/deactivate", None),
    ("post", "/admin/users/1/reactivate", None), ("delete", "/admin/users/1", None),
    ("get", "/admin/users/1/sessions", None), ("post", "/admin/users/1/sessions/revoke", None),
    ("get", "/admin/wallets", None), ("get", "/admin/wallets/1", None),
    ("get", "/admin/wallets/1/transactions", None),
    ("post", "/admin/wallets/1/adjust", {"kind": "RECHARGE", "amount": "10", "reason": "self service"}),
    ("get", "/admin/users/1/orders", None), ("get", "/admin/users/1/trades", None),
    ("get", "/admin/users/1/positions", None), ("get", "/admin/users/1/performance", None),
    ("get", "/admin/users/1/activity", None), ("get", "/admin/audit-logs", None),
]


@pytest.mark.parametrize("method,path,body", ADMIN_ENDPOINTS)
def test_admin_role_cannot_use_any_super_admin_endpoint(client, db, method, path, body):
    make_user(db, "alice", balance="1000")
    login(client, "alice")
    r = getattr(client, method)(API + path, **({"json": body} if body is not None else {}))
    assert r.status_code == 403, (path, r.status_code)


def test_admin_cannot_recharge_own_wallet_or_change_role(client, db):
    me = make_user(db, "alice", balance="1000")
    login(client, "alice")
    r = client.post(f"{API}/admin/wallets/{me.id}/adjust",
                    json={"kind": "RECHARGE", "amount": "99999", "reason": "give myself money"})
    assert r.status_code == 403
    # no endpoint accepts a role change
    r = client.patch(f"{API}/admin/users/{me.id}", json={"role": "SUPER_ADMIN"})
    assert r.status_code == 403
    db.refresh(me)
    assert me.role == UserRole.ADMIN
    assert client.get(f"{API}/wallet").json()["available_balance"] == "1000.0000"


def test_admin_cannot_see_another_admins_data(client, db, instrument):
    a = make_user(db, "alice", balance="10000")
    b = make_user(db, "bob", balance="10000")
    ca, cb = client, new_client()
    login(ca, "alice")
    login(cb, "bob")
    order = place(ca, instrument.id, "k1").json()
    assert cb.get(f"{API}/paper/orders").json() == []  # bob sees none of alice's orders
    assert cb.get(f"{API}/paper/trades").json() == []
    assert cb.post(f"{API}/paper/orders/{order['id']}/cancel").status_code == 404  # cannot touch it
    assert cb.get(f"{API}/wallet").json()["available_balance"] == "10000.0000"
    assert cb.get(f"{API}/admin/wallets/{a.id}").status_code == 403
    assert cb.get(f"{API}/admin/users/{a.id}/orders").status_code == 403


# --- Super Admin account management ---------------------------------------------------
def test_super_admin_creates_admin_with_generated_password(sa_client, db):
    r = create_admin(sa_client, "alice", "2500.00")
    assert r.status_code == 201
    body = r.json()
    temp = body["temporary_password"]
    assert temp and body["user"]["role"] == "ADMIN" and body["user"]["available_balance"] == "2500.0000"
    assert "hashed_password" not in r.text
    user = db.scalar(select(User).where(User.username == "alice"))
    assert user.must_change_password and temp not in user.hashed_password
    # the new admin can log in with it, and is forced to change it
    c = new_client()
    assert login(c, "alice", temp).status_code == 200
    assert c.get(f"{API}/wallet").status_code == 403
    tx = db.scalars(select(WalletTransaction).where(WalletTransaction.user_id == user.id)).all()
    assert [t.type.value for t in tx] == ["INITIAL_CREDIT"]


def test_super_admin_can_set_explicit_password_and_policy_enforced(sa_client):
    assert create_admin(sa_client, "weak1", password="short").status_code == 400
    ok = create_admin(sa_client, "alice", password=STRONG_PW)
    assert ok.status_code == 201 and ok.json()["temporary_password"] is None


def test_duplicate_and_invalid_accounts_rejected(sa_client):
    assert create_admin(sa_client, "alice").status_code == 201
    assert create_admin(sa_client, "alice").status_code == 409
    assert create_admin(sa_client, "Bad Name!").status_code == 400
    r = sa_client.post(f"{API}/admin/users", json={"username": "okname", "email": "not-an-email"})
    assert r.status_code == 400


def test_created_account_is_always_admin_even_if_role_supplied(sa_client, db):
    r = sa_client.post(f"{API}/admin/users", json={"username": "sneaky", "email": "s@example.com",
                                                   "role": "SUPER_ADMIN", "initial_balance": "0"})
    assert r.status_code == 201
    assert db.scalar(select(User).where(User.username == "sneaky")).role == UserRole.ADMIN


def test_deactivate_revokes_sessions_and_blocks_login_then_reactivate(sa_client, db):
    uid = create_admin(sa_client, "alice", password=STRONG_PW).json()["user"]["id"]
    ca = new_client()
    login(ca, "alice")  # forced change pending but session exists
    assert sa_client.post(f"{API}/admin/users/{uid}/deactivate").status_code == 200
    assert ca.get(f"{API}/auth/me").status_code == 401  # session revoked immediately
    assert login(new_client(), "alice").status_code == 401
    assert sa_client.post(f"{API}/admin/users/{uid}/reactivate").json()["is_active"] is True
    assert login(new_client(), "alice").status_code == 200


def test_soft_delete_keeps_history_and_reserves_username(sa_client, db, instrument):
    uid = create_admin(sa_client, "alice", balance="5000", password=STRONG_PW).json()["user"]["id"]
    ca = new_client()
    login(ca, "alice")
    ca.post(f"{API}/auth/change-password", json={"current_password": STRONG_PW, "new_password": OTHER_PW})
    assert place(ca, instrument.id, "k1").status_code == 200

    assert sa_client.delete(f"{API}/admin/users/{uid}").status_code == 204
    assert ca.get(f"{API}/auth/me").status_code == 401
    assert login(new_client(), "alice", OTHER_PW).status_code == 401
    # not listed by default, but the row and ALL history survive
    assert all(u["id"] != uid for u in sa_client.get(f"{API}/admin/users").json())
    assert any(u["id"] == uid and u["deleted_at"] for u in sa_client.get(f"{API}/admin/users?include_deleted=true").json())
    assert len(sa_client.get(f"{API}/admin/users/{uid}/orders").json()) == 1
    txs = sa_client.get(f"{API}/admin/wallets/{uid}/transactions").json()
    assert {t["type"] for t in txs} == {"INITIAL_CREDIT", "TRADE_BUY", "TRADE_REFUND"}  # reservation released on delete
    assert db.scalar(select(User).where(User.id == uid)) is not None
    # username stays reserved so history cannot be re-attributed
    assert create_admin(sa_client, "alice").status_code == 409
    # cannot mutate a deleted account
    assert sa_client.post(f"{API}/admin/users/{uid}/reactivate").status_code == 409
    assert sa_client.post(f"{API}/admin/wallets/{uid}/adjust",
                          json={"kind": "RECHARGE", "amount": "1", "reason": "test reason"}).status_code == 409


def test_super_admin_accounts_cannot_be_managed_through_admin_api(sa_client, superadmin):
    for path, method in ((f"/admin/users/{superadmin.id}/deactivate", "post"), (f"/admin/users/{superadmin.id}", "delete"),
                         (f"/admin/users/{superadmin.id}/reset-password", "post")):
        r = getattr(sa_client, method)(API + path, **({"json": {}} if method == "post" and "reset" in path else {}))
        assert r.status_code == 403, path
    assert sa_client.get(f"{API}/auth/me").status_code == 200


def test_reset_password_revokes_sessions_and_forces_change(sa_client, db):
    uid = create_admin(sa_client, "alice", password=STRONG_PW).json()["user"]["id"]
    ca = new_client()
    login(ca, "alice")
    r = sa_client.post(f"{API}/admin/users/{uid}/reset-password", json={})
    temp = r.json()["temporary_password"]
    assert temp and ca.get(f"{API}/auth/me").status_code == 401
    assert login(new_client(), "alice", STRONG_PW).status_code == 401
    c2 = new_client()
    assert login(c2, "alice", temp).status_code == 200
    assert c2.get(f"{API}/auth/me").json()["must_change_password"] is True


def test_super_admin_lists_and_revokes_sessions(sa_client):
    uid = create_admin(sa_client, "alice", password=STRONG_PW).json()["user"]["id"]
    c1, c2 = new_client(), new_client()
    login(c1, "alice")
    login(c2, "alice")
    assert len(sa_client.get(f"{API}/admin/users/{uid}/sessions").json()) == 2
    assert sa_client.post(f"{API}/admin/users/{uid}/sessions/revoke").json() == {"revoked": 2}
    assert c1.get(f"{API}/auth/me").status_code == 401 and c2.get(f"{API}/auth/me").status_code == 401
    assert sa_client.get(f"{API}/admin/users/{uid}/sessions").json() == []


# --- presence -------------------------------------------------------------------------
def test_online_offline_heartbeat_behaviour(sa_client, db):
    uid = create_admin(sa_client, "alice", password=STRONG_PW).json()["user"]["id"]
    row = lambda: next(u for u in sa_client.get(f"{API}/admin/users").json() if u["id"] == uid)  # noqa: E731
    assert row()["online"] is False  # never logged in -> offline

    ca = new_client()
    login(ca, "alice")
    assert row()["online"] is True and row()["active_sessions"] == 1
    # heartbeat goes stale beyond the 90s timeout -> offline, even though the session is alive
    user = db.get(User, uid)
    user.last_heartbeat_at = auth_service.utcnow() - timedelta(seconds=120)
    db.commit()
    assert row()["online"] is False
    assert ca.post(f"{API}/auth/heartbeat").json()["timeout_seconds"] == 90
    assert row()["online"] is True  # a fresh heartbeat brings it back
    ca.post(f"{API}/auth/logout")
    assert row()["online"] is False  # logout -> immediately offline


def test_dashboard_counts_use_real_data_only(sa_client, db):
    empty = sa_client.get(f"{API}/admin/dashboard").json()
    assert (empty["total_admins"], empty["online_admins"], empty["offline_admins"], empty["deactivated_admins"]) == (0, 0, 0, 0)
    assert empty["admin_summaries"] == []

    ids = {n: create_admin(sa_client, n, password=STRONG_PW).json()["user"]["id"] for n in ("adm1", "adm2", "adm3")}
    login(new_client(), "adm1")  # online
    sa_client.post(f"{API}/admin/users/{ids["adm3"]}/deactivate")
    d = sa_client.get(f"{API}/admin/dashboard").json()
    assert (d["total_admins"], d["online_admins"], d["offline_admins"], d["deactivated_admins"]) == (3, 1, 1, 1)
    assert len(d["admin_summaries"]) == 3 and d["recent_activity"]


# --- audit ----------------------------------------------------------------------------
def test_audit_log_records_important_actions_without_secrets(sa_client, db):
    uid = create_admin(sa_client, "alice", balance="100", password=STRONG_PW).json()["user"]["id"]
    sa_client.post(f"{API}/admin/wallets/{uid}/adjust", json={"kind": "RECHARGE", "amount": "50", "reason": "top up"})
    sa_client.post(f"{API}/admin/users/{uid}/deactivate")
    sa_client.post(f"{API}/admin/users/{uid}/reactivate")
    sa_client.post(f"{API}/admin/users/{uid}/reset-password", json={})
    sa_client.delete(f"{API}/admin/users/{uid}")
    login(new_client(), "alice", "Wrong-Password-1!")

    logs = sa_client.get(f"{API}/admin/audit-logs?limit=200").json()
    actions = {entry["action"] for entry in logs}
    assert {"LOGIN_SUCCESS", "SESSION_CREATED", "USER_CREATED", "WALLET_RECHARGE", "USER_DEACTIVATED",
            "USER_REACTIVATED", "PASSWORD_RESET", "USER_DELETED", "LOGIN_FAILURE"} <= actions
    created = next(e for e in logs if e["action"] == "USER_CREATED")
    assert created["actor_username"] == "root" and created["resource_id"] == str(uid)
    blob = json.dumps(logs).lower()
    for secret in (STRONG_PW.lower(), "wrong-password-1!", "argon2", "hashed_password"):
        assert secret not in blob
    assert sa_client.get(f"{API}/admin/audit-logs?action=USER_DELETED").json()[0]["action"] == "USER_DELETED"


def test_audit_details_sanitised(db):
    from app.services import audit
    entry = audit.record(db, "TEST", details={"password": "x", "nested": {"api_key": "y", "ok": 1}, "reason": "fine"})
    assert entry.details == {"nested": {"ok": 1}, "reason": "fine"}


def test_audit_and_ledger_rows_are_append_only(sa_client, db):
    from app.models.immutability import ImmutableRecordError
    uid = create_admin(sa_client, "alice", balance="100").json()["user"]["id"]
    log = db.scalar(select(AuditLog).order_by(AuditLog.id))
    log.action = "TAMPERED"
    with pytest.raises(ImmutableRecordError):
        db.commit()
    db.rollback()
    tx = db.scalar(select(WalletTransaction).where(WalletTransaction.user_id == uid))
    db.delete(tx)
    with pytest.raises(ImmutableRecordError):
        db.commit()
    db.rollback()


def test_page_view_activity_is_whitelisted(client, db):
    make_user(db, "alice")
    login(client, "alice")
    assert client.post(f"{API}/activity/page-view", json={"page": "strategies"}).status_code == 204
    assert client.post(f"{API}/activity/page-view", json={"page": "<script>"}).status_code == 422
    entry = db.scalar(select(AuditLog).where(AuditLog.action == "PAGE_VIEW"))
    assert entry.resource_id == "strategies"
