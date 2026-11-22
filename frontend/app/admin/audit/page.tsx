"use client";

import { useState } from "react";
import { Button, Select } from "@/components/ui/Controls";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { AUDIT_ACTIONS } from "@/lib/audit";
import { formatDateTime } from "@/lib/money";
import { useApi } from "@/lib/useApi";
import type { AuditEntry } from "@/lib/types";

const PAGE = 100;

function toneFor(action: string): BadgeTone {
  if (action.includes("FAILURE") || action.includes("DELETED") || action.includes("DEACTIVATED") || action.includes("REVOKED"))
    return "negative";
  if (action.startsWith("WALLET") || action.startsWith("PASSWORD")) return "warning";
  if (action.startsWith("ORDER")) return "info";
  return "neutral";
}

export default function AuditLogPage() {
  const [action, setAction] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const query = `/admin/audit-logs?limit=${limit}${action ? `&action=${action}` : ""}`;
  const { data, error, loading } = useApi<AuditEntry[]>(query);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Append-only record of sign-ins, account changes, wallet adjustments and trading actions. Secrets are never stored."
      />
      <SectionCard title="Events" flush>
        {error ? (
          <div className="p-5"><Notice tone="error">{error.message}</Notice></div>
        ) : loading || !data ? (
          <div className="p-5"><LoadingState label="Loading audit log…" /></div>
        ) : (
          <>
            <DataTable
              caption="Audit log"
              rows={data}
              rowKey={(r) => String(r.id)}
              emptyMessage="No audit events yet."
              searchText={(r) => `${r.actor_username ?? ""} ${r.action} ${r.resource_type ?? ""} ${r.resource_id ?? ""} ${JSON.stringify(r.details ?? {})}`}
              searchPlaceholder="Search actor, action or resource"
              filters={
                <div className="w-full sm:w-56">
                  <label htmlFor="audit-action" className="sr-only">Filter by action</label>
                  <Select id="audit-action" value={action} onChange={(e) => { setAction(e.target.value); setLimit(PAGE); }}>
                    <option value="">All actions</option>
                    {AUDIT_ACTIONS.map((a) => (
                      <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
                    ))}
                  </Select>
                </div>
              }
              columns={[
                { header: "Time", render: (r) => <span className="whitespace-nowrap text-secondary">{formatDateTime(r.created_at)}</span> },
                { header: "Actor", render: (r) => <span className="font-medium">{r.actor_username ?? "—"}</span> },
                { header: "Action", render: (r) => <StatusBadge tone={toneFor(r.action)}>{r.action.replace(/_/g, " ")}</StatusBadge> },
                { header: "Resource", render: (r) => <span className="text-secondary">{r.resource_type ? `${r.resource_type} ${r.resource_id ?? ""}` : "—"}</span> },
                {
                  header: "Details",
                  render: (r) => (
                    <code className="block max-w-xs truncate font-mono text-[11px] text-muted" title={JSON.stringify(r.details ?? {})}>
                      {r.details ? JSON.stringify(r.details) : "—"}
                    </code>
                  ),
                },
              ]}
            />
            {data.length >= limit && (
              <div className="border-t border-line p-4 text-center">
                <Button onClick={() => setLimit((l) => l + PAGE)}>Load more</Button>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </>
  );
}
