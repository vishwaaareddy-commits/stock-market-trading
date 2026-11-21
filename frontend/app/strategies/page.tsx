import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { MockDataNotice } from "@/components/ui/MockBadge";
import { PageHeader } from "@/components/ui/PageHeader";
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
        <Card title="Strategies">
          <DataTable
            rows={MOCK_STRATEGIES}
            rowKey={(r) => r.id}
            columns={[
              { header: "Name", render: (r) => r.name },
              { header: "Type", render: (r) => <code className="font-mono text-xs">{r.type}</code> },
              { header: "Timeframe", render: (r) => r.timeframe },
              { header: "Parameters", render: (r) => r.params },
              {
                header: "Status",
                render: (r) => <Badge tone={r.status === "Planned" ? "info" : "neutral"}>{r.status}</Badge>,
              },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
