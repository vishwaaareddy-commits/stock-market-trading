"use client";

import { DataTable } from "@/components/ui/DataTable";
import { MockDataNotice } from "@/components/ui/MockBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { formatPrice, valueTone } from "@/lib/format";
import { MOCK_POSITIONS } from "@/lib/mock-data";

const TONE_TEXT = { positive: "text-positive", negative: "text-negative", neutral: "text-secondary" } as const;

export default function PaperTradingPage() {
  return (
    <>
      <PageHeader
        title="Paper Trading"
        description="Simulated, long-only positions. Orders are never sent to a broker."
      />
      <div className="space-y-6">
        <MockDataNotice>The position below is a placeholder, not a real or simulated trade.</MockDataNotice>
        <SectionCard title="Open positions" description="Simulated, long-only" flush>
          <DataTable
            caption="Open positions"
            rows={MOCK_POSITIONS}
            rowKey={(r) => r.symbol}
            searchText={(r) => r.symbol}
            searchPlaceholder="Search symbol"
            emptyMessage="No open paper positions."
            columns={[
              { header: "Symbol", render: (r) => <span className="font-semibold">{r.symbol}</span> },
              { header: "Qty", align: "right", render: (r) => r.quantity },
              { header: "Entry", align: "right", render: (r) => formatPrice(r.entryPrice) },
              { header: "Last", align: "right", render: (r) => formatPrice(r.lastPrice) },
              {
                header: "P&L",
                align: "right",
                render: (r) => {
                  const pnl = (r.lastPrice - r.entryPrice) * r.quantity;
                  return <span className={`font-semibold ${TONE_TEXT[valueTone(pnl)]}`}>{formatPrice(pnl)}</span>;
                },
              },
            ]}
          />
        </SectionCard>
      </div>
    </>
  );
}
