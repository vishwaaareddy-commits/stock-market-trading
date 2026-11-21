import { Badge, actionTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { MockDataNotice } from "@/components/ui/MockBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatPrice } from "@/lib/format";
import { MOCK_SIGNALS } from "@/lib/mock-data";

export default function SignalsPage() {
  return (
    <>
      <PageHeader
        title="Signals"
        description="One decision (BUY, SELL or HOLD) per strategy, instrument and completed candle."
      />
      <div className="space-y-6">
        <MockDataNotice>
          These rows are fabricated examples of the table layout. No strategy has produced a signal.
        </MockDataNotice>
        <Card title="Recent signals">
          <DataTable
            rows={MOCK_SIGNALS}
            rowKey={(r) => r.id}
            columns={[
              { header: "Candle", render: (r) => <span className="font-mono">{r.time}</span> },
              { header: "Symbol", render: (r) => r.symbol },
              { header: "Strategy", render: (r) => r.strategy },
              { header: "Action", render: (r) => <Badge tone={actionTone(r.action)}>{r.action}</Badge> },
              { header: "Price", align: "right", render: (r) => formatPrice(r.price) },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
