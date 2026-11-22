"use client";

import { DataTable } from "@/components/ui/DataTable";
import { MockDataNotice } from "@/components/ui/MockBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MOCK_STRATEGIES } from "@/lib/mock-data";

export default function StrategiesPage() {
  return (
    <>
      <PageHeader
        title="Strategies"
        description="Each strategy is an independent plug-in. None are implemented yet."
      />
      <div className="space-y-6">
        <MockDataNotice>Strategy list is a placeholder showing planned strategies.</MockDataNotice>
        <SectionCard title="Strategies" description="Planned and draft strategy definitions" flush>
          <DataTable
            caption="Strategies"
            rows={MOCK_STRATEGIES}
            rowKey={(r) => r.id}
            searchText={(r) => `${r.name} ${r.type} ${r.status}`}
            searchPlaceholder="Search strategies"
            columns={[
              { header: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
              {
                header: "Type",
                render: (r) => (
                  <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs text-secondary">{r.type}</code>
                ),
              },
              { header: "Timeframe", render: (r) => r.timeframe },
              { header: "Parameters", render: (r) => <span className="text-secondary">{r.params}</span> },
              {
                header: "Status",
                render: (r) => <StatusBadge tone={r.status === "Planned" ? "info" : "neutral"}>{r.status}</StatusBadge>,
              },
            ]}
          />
        </SectionCard>
      </div>
    </>
  );
}
