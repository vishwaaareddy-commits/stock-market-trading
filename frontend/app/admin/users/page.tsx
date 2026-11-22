"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { AccountBadge, PresenceBadge } from "@/components/admin/PresenceBadge";
import { Select } from "@/components/ui/Controls";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { formatVirtual, timeAgo } from "@/lib/money";
import { useApi } from "@/lib/useApi";
import type { AdminRow } from "@/lib/types";

type Filter = "all" | "online" | "offline" | "deactivated" | "deleted";

export default function AdminsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const { data, error, loading } = useApi<AdminRow[]>("/admin/users?include_deleted=true");

  const rowFilter = useCallback(
    (r: AdminRow) => {
      switch (filter) {
        case "online":
          return r.online;
        case "offline":
          return !r.online && r.is_active && !r.deleted_at;
        case "deactivated":
          return !r.is_active && !r.deleted_at;
        case "deleted":
          return Boolean(r.deleted_at);
        default:
          return !r.deleted_at;
      }
    },
    [filter],
  );

  return (
    <>
      <PageHeader title="Admins" description="Create and manage Admin accounts. Registration is closed to everyone else.">
        <Link
          href="/admin/users/new"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent/90"
        >
          <Plus size={16} aria-hidden="true" /> Create admin
        </Link>
      </PageHeader>
      <SectionCard title="All admins" description="Presence is based on authenticated heartbeats" flush>
        {error ? (
          <div className="p-5">
            <Notice tone="error">{error.message}</Notice>
          </div>
        ) : loading || !data ? (
          <div className="p-5">
            <LoadingState label="Loading admins…" />
          </div>
        ) : (
          <DataTable
            caption="Admin accounts"
            rows={data}
            rowKey={(r) => String(r.id)}
            emptyMessage="No admin accounts yet. Use “Create admin” to add the first one."
            searchText={(r) => `${r.username} ${r.email} ${r.display_name ?? ""}`}
            searchPlaceholder="Search name, username or email"
            rowFilter={rowFilter}
            filters={
              <div className="w-full sm:w-44">
                <label htmlFor="admin-filter" className="sr-only">
                  Filter admins
                </label>
                <Select id="admin-filter" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                  <option value="all">All (not deleted)</option>
                  <option value="online">Online</option>
                  <option value="offline">Offline</option>
                  <option value="deactivated">Deactivated</option>
                  <option value="deleted">Deleted</option>
                </Select>
              </div>
            }
            columns={[
              {
                header: "Admin",
                render: (r) => (
                  <Link href={`/admin/users/${r.id}`} className="block">
                    <span className="font-medium text-accent hover:underline">{r.display_name ?? r.username}</span>
                    <span className="block text-xs text-muted">
                      @{r.username} · {r.email}
                    </span>
                  </Link>
                ),
              },
              { header: "Account", render: (r) => <AccountBadge row={r} /> },
              { header: "Presence", render: (r) => <PresenceBadge online={r.online} /> },
              { header: "Last login", render: (r) => <span className="text-secondary">{timeAgo(r.last_login_at)}</span> },
              { header: "Last activity", render: (r) => <span className="text-secondary">{timeAgo(r.last_activity_at)}</span> },
              { header: "Sessions", align: "right", render: (r) => r.active_sessions },
              { header: "Available (virtual)", align: "right", render: (r) => formatVirtual(r.available_balance) },
            ]}
          />
        )}
      </SectionCard>
    </>
  );
}
