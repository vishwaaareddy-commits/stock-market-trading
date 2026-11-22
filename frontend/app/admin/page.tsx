"use client";

import { Activity, UserCheck, UserMinus, UserX, Users } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { activityLook } from "@/components/admin/ActivityIcon";
import { PresenceBadge } from "@/components/admin/PresenceBadge";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingState } from "@/components/ui/LoadingState";
import { MetricCard } from "@/components/ui/MetricCard";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { describeAction } from "@/lib/audit";
import { formatDateTime, formatSigned, formatVirtual, signTone, timeAgo } from "@/lib/money";
import { useApi } from "@/lib/useApi";
import type { AdminDashboard } from "@/lib/types";

const REFRESH_MS = 20_000;
const TONE_TEXT = { positive: "text-positive", negative: "text-negative", neutral: "text-secondary" } as const;

export default function ControlCentrePage() {
  const { data, error, loading, reload } = useApi<AdminDashboard>("/admin/dashboard");

  useEffect(() => {
    const t = setInterval(reload, REFRESH_MS); // live data only; no placeholders
    return () => clearInterval(t);
  }, [reload]);

  return (
    <>
      <PageHeader
        title="Control Centre"
        description="Live status of Admin accounts, their virtual wallets and paper-trading activity."
      />
      <div className="space-y-6">
        {error ? (
          <Notice tone="error">{error.message}</Notice>
        ) : loading || !data ? (
          <LoadingState label="Loading dashboard…" rows={4} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
              <MetricCard label="Total admins" value={String(data.total_admins)} icon={Users} hint="Excluding deleted" />
              <MetricCard
                label="Online"
                value={String(data.online_admins)}
                icon={UserCheck}
                hint={`Heartbeat within ${data.heartbeat_timeout_seconds}s`}
              />
              <MetricCard label="Offline" value={String(data.offline_admins)} icon={UserMinus} hint="Active but not online" />
              <MetricCard label="Deactivated" value={String(data.deactivated_admins)} icon={UserX} hint="Cannot sign in" />
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-3">
              <SectionCard
                title="Admin paper-trading summary"
                description="Virtual balances and realized P&L per admin"
                className="lg:col-span-2"
                flush
              >
                <DataTable
                  caption="Admin summaries"
                  rows={data.admin_summaries}
                  rowKey={(r) => String(r.user_id)}
                  emptyMessage="No admin accounts yet. Create one from the Admins page."
                  searchText={(r) => r.username}
                  searchPlaceholder="Search admins"
                  columns={[
                    {
                      header: "Admin",
                      render: (r) => (
                        <Link href={`/admin/users/${r.user_id}`} className="font-medium text-accent hover:underline">
                          {r.username}
                        </Link>
                      ),
                    },
                    { header: "Presence", render: (r) => <PresenceBadge online={r.online} /> },
                    { header: "Available", align: "right", render: (r) => formatVirtual(r.available_balance) },
                    {
                      header: "Realized P&L",
                      align: "right",
                      render: (r) => <span className={TONE_TEXT[signTone(r.realized_pnl)]}>{formatSigned(r.realized_pnl)}</span>,
                    },
                    { header: "Orders", align: "right", render: (r) => r.orders },
                    { header: "Open lots", align: "right", render: (r) => r.open_lots },
                  ]}
                />
              </SectionCard>

              <SectionCard title="Recent activity" description="Latest recorded actions" flush>
                {data.recent_activity.length === 0 ? (
                  <div className="p-5">
                    <EmptyState title="No activity yet" description="Actions appear here as people use the system." icon={Activity} />
                  </div>
                ) : (
                  <ul className="divide-y divide-line">
                    {data.recent_activity.slice(0, 8).map((a) => {
                      const { icon: Icon, tone } = activityLook(a.action);
                      const quiet = a.action === "PAGE_VIEW";
                      return (
                        <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                            <Icon size={14} aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-sm ${quiet ? "text-muted" : "text-foreground"}`}>
                              <span className="font-medium">{a.actor_username ?? "system"}</span>{" "}
                              <span className={quiet ? "" : "text-secondary"}>{describeAction(a.action, a.details)}</span>
                            </p>
                            <p className="text-xs text-muted" title={formatDateTime(a.created_at)}>
                              {timeAgo(a.created_at)}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="border-t border-line px-5 py-3">
                  <Link href="/admin/audit" className="text-xs font-medium text-accent hover:underline">
                    View the full audit log →
                  </Link>
                </div>
              </SectionCard>
            </div>
            <p className="text-xs text-muted">Refreshes every {REFRESH_MS / 1000}s. Balances shown are VIRTUAL.</p>
          </>
        )}
      </div>
    </>
  );
}
