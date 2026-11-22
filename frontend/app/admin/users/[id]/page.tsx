"use client";

import { ArrowLeft, KeyRound, LogOut, Pencil, Trash2, UserCheck, UserX } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CredentialDialog } from "@/components/admin/CredentialDialog";
import { AccountBadge, PresenceBadge } from "@/components/admin/PresenceBadge";
import { Button, Field, Input } from "@/components/ui/Controls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { MetricCard } from "@/components/ui/MetricCard";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { Tabs } from "@/components/ui/Tabs";
import { VirtualBadge } from "@/components/ui/VirtualBadge";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { LineChart } from "@/components/ui/LineChart";
import { LedgerTable } from "@/components/wallet/LedgerTable";
import { WalletAdjustDialog } from "@/components/wallet/WalletAdjustDialog";
import { WalletSummary } from "@/components/wallet/WalletSummary";
import { describeAction } from "@/lib/audit";
import { HttpError, api } from "@/lib/client";
import { formatCompact, formatDateTime, formatSigned, formatVirtual, signTone, timeAgo } from "@/lib/money";
import { cashSeries } from "@/lib/series";
import { useApi } from "@/lib/useApi";
import type {
  AdminRow,
  AuditEntry,
  CredentialResult,
  Order,
  Performance,
  Position,
  SessionInfo,
  Trade,
  Wallet,
  WalletTx,
} from "@/lib/types";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "wallet", label: "Wallet" },
  { id: "orders", label: "Orders" },
  { id: "trades", label: "Trades & positions" },
  { id: "sessions", label: "Sessions" },
  { id: "activity", label: "Activity" },
];

const ORDER_TONE: Record<Order["status"], BadgeTone> = {
  PENDING: "info",
  FILLED: "positive",
  CANCELLED: "neutral",
  REJECTED: "negative",
};
const TONE_TEXT = { positive: "text-positive", negative: "text-negative", neutral: "text-secondary" } as const;

function Panel({ id, active, children }: { id: string; active: string; children: React.ReactNode }) {
  if (id !== active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className="space-y-6 pt-6">
      {children}
    </div>
  );
}

function Async<T>({ state, children }: { state: { data?: T; error?: HttpError; loading: boolean }; children: (d: T) => React.ReactNode }) {
  if (state.error) return <Notice tone="error">{state.error.message}</Notice>;
  if (state.loading || state.data === undefined) return <LoadingState />;
  return <>{children(state.data)}</>;
}

export default function AdminDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState("overview");
  const user = useApi<AdminRow>(`/admin/users/${id}`);

  const [confirm, setConfirm] = useState<null | "deactivate" | "delete" | "revoke" | "reset">(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [credential, setCredential] = useState<CredentialResult | null>(null);
  const [editing, setEditing] = useState(false);

  const u = user.data;
  const base = `/admin/users/${id}`;

  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      if (success) setNotice(success);
      user.reload();
    } catch (err) {
      setActionError(err instanceof HttpError ? err.message : "Action failed.");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const doConfirm = () => {
    if (confirm === "deactivate") return run(() => api(`${base}/deactivate`, { method: "POST" }), "Account deactivated and sessions revoked.");
    if (confirm === "revoke") return run(() => api(`${base}/sessions/revoke`, { method: "POST" }), "Active sessions revoked.");
    if (confirm === "delete")
      return run(async () => {
        await api(base, { method: "DELETE" });
        router.push("/admin/users");
      });
    if (confirm === "reset")
      return run(async () => {
        const res = await api<CredentialResult>(`${base}/reset-password`, { method: "POST", body: {} });
        setCredential(res);
      }, "Password reset. Sessions revoked.");
  };

  const isDeleted = Boolean(u?.deleted_at);

  return (
    <>
      <PageHeader
        title={u ? (u.display_name ?? u.username) : "Admin"}
        description={u ? `@${u.username} · ${u.email}` : undefined}
      >
        <Link href="/admin/users" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-secondary hover:bg-elevated hover:text-foreground">
          <ArrowLeft size={16} aria-hidden="true" /> All admins
        </Link>
      </PageHeader>

      <Async state={user}>
        {(row) => (
          <div className="space-y-6">
            <SectionCard>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <AccountBadge row={row} />
                  <PresenceBadge online={row.online} />
                  <span className="text-xs text-muted">
                    Last heartbeat {timeAgo(row.last_heartbeat_at)} · {row.active_sessions} active session
                    {row.active_sessions === 1 ? "" : "s"}
                  </span>
                </div>
                {!isDeleted && (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setEditing((v) => !v)}>
                      <Pencil size={14} aria-hidden="true" /> Edit
                    </Button>
                    <Button onClick={() => setConfirm("reset")}>
                      <KeyRound size={14} aria-hidden="true" /> Reset password
                    </Button>
                    <Button onClick={() => setConfirm("revoke")} disabled={row.active_sessions === 0}>
                      <LogOut size={14} aria-hidden="true" /> Revoke sessions
                    </Button>
                    {row.is_active ? (
                      <Button onClick={() => setConfirm("deactivate")}>
                        <UserX size={14} aria-hidden="true" /> Deactivate
                      </Button>
                    ) : (
                      <Button onClick={() => run(() => api(`${base}/reactivate`, { method: "POST" }), "Account reactivated.")} disabled={busy}>
                        <UserCheck size={14} aria-hidden="true" /> Reactivate
                      </Button>
                    )}
                    <Button onClick={() => setConfirm("delete")} className="!text-negative">
                      <Trash2 size={14} aria-hidden="true" /> Delete
                    </Button>
                  </div>
                )}
              </div>
              {notice && <div className="mt-4"><Notice tone="success">{notice}</Notice></div>}
              {actionError && <div className="mt-4"><Notice tone="error">{actionError}</Notice></div>}
              {isDeleted && (
                <div className="mt-4">
                  <Notice tone="info">
                    This account was deleted on {formatDateTime(row.deleted_at)}. Sign-in is blocked, but its wallet,
                    trades and audit history are preserved permanently.
                  </Notice>
                </div>
              )}
              {editing && !isDeleted && (
                <EditProfile row={row} onSaved={() => { setEditing(false); setNotice("Profile updated."); user.reload(); }} baseUrl={base} />
              )}
            </SectionCard>

            <div>
              <Tabs tabs={TABS} active={tab} onChange={setTab} label="Admin details" />
              <Panel id="overview" active={tab}>
                <OverviewTab row={row} baseUrl={base} />
              </Panel>
              <Panel id="wallet" active={tab}>
                <WalletTab row={row} deleted={isDeleted} onChanged={user.reload} />
              </Panel>
              <Panel id="orders" active={tab}>
                <OrdersTab baseUrl={base} />
              </Panel>
              <Panel id="trades" active={tab}>
                <TradesTab baseUrl={base} />
              </Panel>
              <Panel id="sessions" active={tab}>
                <SessionsTab baseUrl={base} />
              </Panel>
              <Panel id="activity" active={tab}>
                <ActivityTab baseUrl={base} />
              </Panel>
            </div>

          </div>
        )}
      </Async>

      <ConfirmDialog
        open={confirm !== null}
        busy={busy}
        danger={confirm === "delete" || confirm === "deactivate"}
        title={
          confirm === "delete" ? "Delete this admin?" : confirm === "deactivate" ? "Deactivate this admin?"
          : confirm === "reset" ? "Reset password?" : "Revoke all sessions?"
        }
        description={
          confirm === "delete"
            ? "Sign-in is blocked and sessions are revoked. The account is soft-deleted: wallet, ledger, orders, trades and audit history are kept."
            : confirm === "deactivate"
              ? "They are signed out immediately and cannot sign in until reactivated. History is kept."
              : confirm === "reset"
                ? "A new temporary password is generated and shown once. All their sessions are revoked and they must change it at next sign-in."
                : "Every active session for this admin is ended immediately."
        }
        confirmLabel={confirm === "delete" ? "Delete" : confirm === "deactivate" ? "Deactivate" : confirm === "reset" ? "Reset password" : "Revoke sessions"}
        onConfirm={doConfirm}
        onClose={() => setConfirm(null)}
      />
      <CredentialDialog
        open={credential !== null}
        username={u?.username ?? ""}
        password={credential?.temporary_password ?? null}
        onClose={() => setCredential(null)}
      />
    </>
  );
}

function EditProfile({ row, baseUrl, onSaved }: { row: AdminRow; baseUrl: string; onSaved: () => void }) {
  const [name, setName] = useState(row.display_name ?? "");
  const [email, setEmail] = useState(row.email);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(baseUrl, { method: "PATCH", body: { display_name: name, email } });
      onSaved();
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="mt-4 grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
      <Field label="Display name" htmlFor="ep-name">
        <Input id="ep-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email" htmlFor="ep-email">
        <Input id="ep-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {error && <div className="sm:col-span-2"><Notice tone="error">{error}</Notice></div>}
      <div className="sm:col-span-2">
        <Button variant="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}

function OverviewTab({ row, baseUrl }: { row: AdminRow; baseUrl: string }) {
  const perf = useApi<Performance>(`${baseUrl}/performance`);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Available" value={formatVirtual(row.available_balance)} hint="Virtual funds" />
        <MetricCard label="Reserved" value={formatVirtual(row.reserved_balance)} hint="Pending BUY orders" />
        <MetricCard label="Created" value={formatDateTime(row.created_at)} />
        <MetricCard label="Last login" value={row.last_login_at ? formatDateTime(row.last_login_at) : "Never"} hint={`Last activity ${timeAgo(row.last_activity_at)}`} />
      </div>
      <SectionCard title="Performance" description="Paper trading only" action={<VirtualBadge />}>
        <Async state={perf}>
          {(p) =>
            p.closed_trades === 0 && p.open_positions === 0 ? (
              <p className="text-sm text-muted">No paper trades yet.</p>
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Realized P&L", formatSigned(p.realized_pnl), TONE_TEXT[signTone(p.realized_pnl)]],
                  ["Unrealized P&L", p.unrealized_pnl === null ? "—" : formatSigned(p.unrealized_pnl), "text-foreground"],
                  ["Win rate", p.win_rate === null ? "—" : `${p.win_rate}%`, "text-foreground"],
                  ["Closed trades", String(p.closed_trades), "text-foreground"],
                ].map(([k, v, c]) => (
                  <div key={k}>
                    <dt className="text-xs uppercase tracking-wide text-muted">{k}</dt>
                    <dd className={`mt-1 text-lg font-semibold tabular-nums ${c}`}>{v}</dd>
                  </div>
                ))}
              </dl>
            )
          }
        </Async>
      </SectionCard>
    </>
  );
}

function WalletTab({ row, deleted, onChanged }: { row: AdminRow; deleted: boolean; onChanged: () => void }) {
  const wallet = useApi<Wallet>(`/admin/wallets/${row.id}`);
  const txs = useApi<WalletTx[]>(`/admin/wallets/${row.id}/transactions?limit=200`);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <VirtualBadge />
          <span className="text-sm text-secondary">Individual virtual wallet</span>
        </div>
        {!deleted && (
          <Button variant="primary" onClick={() => { setDone(false); setOpen(true); }}>
            Recharge / deduct
          </Button>
        )}
      </div>
      {done && <Notice tone="success">Virtual wallet updated.</Notice>}
      <Async state={wallet}>{(w) => <WalletSummary wallet={w} />}</Async>
      <ChartContainer
        title="Balance over time"
        description="Available + reserved virtual funds after each ledger entry"
        isEmpty={!txs.data || txs.data.length < 2}
        emptyTitle={txs.loading ? "Loading balance history…" : "No balance history yet"}
        emptyDescription="The chart appears after this wallet's second event."
      >
        <LineChart points={cashSeries(txs.data ?? [])} format={formatCompact} label="Virtual cash balance over time" />
      </ChartContainer>
      <SectionCard title="Transaction history" description="Immutable ledger" flush>
        <Async state={txs}>{(rows) => <LedgerTable rows={rows} />}</Async>
      </SectionCard>
      <WalletAdjustDialog
        open={open}
        target={{ id: row.id, username: row.username }}
        onClose={() => setOpen(false)}
        onDone={() => { setDone(true); wallet.reload(); txs.reload(); onChanged(); }}
      />
    </>
  );
}

function OrdersTab({ baseUrl }: { baseUrl: string }) {
  const orders = useApi<Order[]>(`${baseUrl}/orders?limit=200`);
  return (
    <SectionCard title="Paper orders" description="Never sent to a broker" action={<VirtualBadge />} flush>
      <Async state={orders}>
        {(rows) => (
          <DataTable
            caption="Paper orders"
            rows={rows}
            rowKey={(r) => String(r.id)}
            emptyMessage="This admin has not placed any paper orders."
            searchText={(r) => `${r.id} ${r.side} ${r.status}`}
            searchPlaceholder="Search orders"
            columns={[
              { header: "#", render: (r) => r.id },
              { header: "Placed", render: (r) => <span className="text-secondary">{formatDateTime(r.created_at)}</span> },
              { header: "Side", render: (r) => <StatusBadge tone={r.side === "BUY" ? "positive" : "negative"}>{r.side}</StatusBadge> },
              { header: "Qty", align: "right", render: (r) => r.quantity },
              { header: "Limit", align: "right", render: (r) => formatVirtual(r.limit_price) },
              { header: "Fill", align: "right", render: (r) => formatVirtual(r.fill_price) },
              { header: "Status", render: (r) => <StatusBadge tone={ORDER_TONE[r.status]}>{r.status}</StatusBadge> },
              { header: "Note", render: (r) => <span className="text-muted">{r.status_reason ?? ""}</span> },
            ]}
          />
        )}
      </Async>
    </SectionCard>
  );
}

function TradesTab({ baseUrl }: { baseUrl: string }) {
  const positions = useApi<Position[]>(`${baseUrl}/positions`);
  const trades = useApi<Trade[]>(`${baseUrl}/trades?limit=200`);
  return (
    <>
      <SectionCard title="Open positions" action={<VirtualBadge />} flush>
        <Async state={positions}>
          {(rows) => (
            <DataTable
              caption="Open positions"
              rows={rows}
              rowKey={(r) => String(r.instrument_id)}
              emptyMessage="No open positions."
              columns={[
                { header: "Symbol", render: (r) => <span className="font-semibold">{r.symbol}</span> },
                { header: "Qty", align: "right", render: (r) => r.quantity },
                { header: "Avg entry", align: "right", render: (r) => formatVirtual(r.avg_entry_price) },
                { header: "Last", align: "right", render: (r) => formatVirtual(r.last_price) },
                { header: "Unrealized P&L", align: "right", render: (r) => (r.unrealized_pnl === null ? "—" : formatSigned(r.unrealized_pnl)) },
              ]}
            />
          )}
        </Async>
      </SectionCard>
      <SectionCard title="Trades" description="Open and closed lots" action={<VirtualBadge />} flush>
        <Async state={trades}>
          {(rows) => (
            <DataTable
              caption="Trades"
              rows={rows}
              rowKey={(r) => String(r.id)}
              emptyMessage="No trades yet."
              columns={[
                { header: "Opened", render: (r) => <span className="text-secondary">{formatDateTime(r.opened_at)}</span> },
                { header: "Qty", align: "right", render: (r) => r.quantity },
                { header: "Entry", align: "right", render: (r) => formatVirtual(r.entry_price) },
                { header: "Exit", align: "right", render: (r) => formatVirtual(r.exit_price) },
                { header: "Status", render: (r) => <StatusBadge tone={r.status === "OPEN" ? "info" : "neutral"}>{r.status}</StatusBadge> },
                { header: "P&L", align: "right", render: (r) => <span className={TONE_TEXT[signTone(r.pnl)]}>{r.pnl === null ? "—" : formatSigned(r.pnl)}</span> },
              ]}
            />
          )}
        </Async>
      </SectionCard>
    </>
  );
}

function SessionsTab({ baseUrl }: { baseUrl: string }) {
  const sessions = useApi<SessionInfo[]>(`${baseUrl}/sessions`);
  return (
    <SectionCard title="Active sessions" description="Revoking ends them immediately" flush>
      <Async state={sessions}>
        {(rows) => (
          <DataTable
            caption="Active sessions"
            rows={rows}
            rowKey={(r) => String(r.id)}
            emptyMessage="No active sessions."
            columns={[
              { header: "Started", render: (r) => formatDateTime(r.created_at) },
              { header: "Last seen", render: (r) => <span className="text-secondary">{timeAgo(r.last_seen_at)}</span> },
              { header: "Expires", render: (r) => <span className="text-secondary">{formatDateTime(r.expires_at)}</span> },
              { header: "IP", render: (r) => r.ip_address ?? "—" },
              { header: "Device", render: (r) => <span className="text-muted">{(r.user_agent ?? "—").slice(0, 60)}</span> },
            ]}
          />
        )}
      </Async>
    </SectionCard>
  );
}

function ActivityTab({ baseUrl }: { baseUrl: string }) {
  const activity = useApi<AuditEntry[]>(`${baseUrl}/activity?limit=100`);
  return (
    <SectionCard title="Recent activity" description="Recorded actions only: no screen, keystroke or content capture" flush>
      <Async state={activity}>
        {(rows) => (
          <DataTable
            caption="Activity"
            rows={rows}
            rowKey={(r) => String(r.id)}
            emptyMessage="No activity recorded yet."
            searchText={(r) => `${r.action} ${r.resource_type ?? ""} ${r.resource_id ?? ""}`}
            searchPlaceholder="Search activity"
            columns={[
              { header: "Time", render: (r) => <span className="whitespace-nowrap text-secondary">{formatDateTime(r.created_at)}</span> },
              { header: "Action", render: (r) => <span className="font-medium">{describeAction(r.action, r.details)}</span> },
              { header: "Resource", render: (r) => <span className="text-muted">{r.resource_type ? `${r.resource_type} ${r.resource_id ?? ""}` : "—"}</span> },
            ]}
          />
        )}
      </Async>
    </SectionCard>
  );
}
