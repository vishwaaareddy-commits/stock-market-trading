"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { DataTable } from "@/components/ui/DataTable";
import { MockDataNotice } from "@/components/ui/MockBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
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
        <MockDataNotice>Symbols and prices are fictional samples, not real NSE quotes.</MockDataNotice>
        <SectionCard title="Instruments" description="Sample NSE instruments" flush>
          <DataTable
            caption="Instruments"
            rows={MOCK_INSTRUMENTS}
            rowKey={(r) => r.symbol}
            searchText={(r) => `${r.symbol} ${r.name} ${r.exchange}`}
            searchPlaceholder="Search symbol or name"
            columns={[
              { header: "Symbol", render: (r) => <span className="font-semibold">{r.symbol}</span> },
              { header: "Exchange", render: (r) => <span className="text-secondary">{r.exchange}</span> },
              { header: "Name", render: (r) => <span className="text-secondary">{r.name}</span> },
              { header: "Last", align: "right", render: (r) => formatPrice(r.lastPrice) },
              {
                header: "Change",
                align: "right",
                render: (r) => (
                  <span
                    className={`inline-flex items-center justify-end gap-1 font-medium ${
                      r.changePct >= 0 ? "text-positive" : "text-negative"
                    }`}
                  >
                    {r.changePct >= 0 ? (
                      <TrendingUp size={14} aria-hidden="true" />
                    ) : (
                      <TrendingDown size={14} aria-hidden="true" />
                    )}
                    {formatPercent(r.changePct)}
                  </span>
                ),
              },
            ]}
          />
        </SectionCard>
      </div>
    </>
  );
}
