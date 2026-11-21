import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { MockDataNotice } from "@/components/ui/MockBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatPrice } from "@/lib/format";
import { MOCK_POSITIONS } from "@/lib/mock-data";

export default function PaperTradingPage() {
  return (
    <>
      <PageHeader
        title="Paper Trading"
        description="Simulated, long-only positions. Orders are never sent to a broker."
      />
      <div className="space-y-6">
        <MockDataNotice>The position below is a placeholder, not a real or simulated trade.</MockDataNotice>
        <Card title="Open positions">
          <DataTable
            rows={MOCK_POSITIONS}
            rowKey={(r) => r.symbol}
            columns={[
              { header: "Symbol", render: (r) => r.symbol },
              { header: "Qty", align: "right", render: (r) => r.quantity },
              { header: "Entry", align: "right", render: (r) => formatPrice(r.entryPrice) },
              { header: "Last", align: "right", render: (r) => formatPrice(r.lastPrice) },
              {
                header: "P&L",
                align: "right",
                render: (r) => formatPrice((r.lastPrice - r.entryPrice) * r.quantity),
              },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
