import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { MockDataNotice } from "@/components/ui/MockBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatPercent, formatPrice } from "@/lib/format";
import { MOCK_INSTRUMENTS } from "@/lib/mock-data";

export default function MarketDataPage() {
  return (
    <>
      <PageHeader
        title="Market Data"
        description="NSE instruments and 15-minute candles. No data provider is connected yet."
      />
      <div className="space-y-6">
        <MockDataNotice>
          Symbols and prices are fictional samples, not real NSE quotes.
        </MockDataNotice>
        <Card title="Instruments">
          <DataTable
            rows={MOCK_INSTRUMENTS}
            rowKey={(r) => r.symbol}
            columns={[
              { header: "Symbol", render: (r) => <span className="font-mono">{r.symbol}</span> },
              { header: "Exchange", render: (r) => r.exchange },
              { header: "Name", render: (r) => r.name },
              { header: "Last", align: "right", render: (r) => formatPrice(r.lastPrice) },
              {
                header: "Change",
                align: "right",
                render: (r) => (
                  <span className={r.changePct >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {formatPercent(r.changePct)}
                  </span>
                ),
              },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
