"use client";

import { useCallback, useState } from "react";
import { Select } from "@/components/ui/Controls";
import { DataTable } from "@/components/ui/DataTable";
import { MockDataNotice } from "@/components/ui/MockBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, actionTone } from "@/components/ui/StatusBadge";
import { formatPrice } from "@/lib/format";
import { MOCK_SIGNALS, type MockSignal } from "@/lib/mock-data";

export default function SignalsPage() {
  const [action, setAction] = useState<"ALL" | MockSignal["action"]>("ALL");
  const rowFilter = useCallback((r: MockSignal) => action === "ALL" || r.action === action, [action]);

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
        <SectionCard title="Recent signals" description="Newest first" flush>
          <DataTable
            caption="Recent signals"
            rows={MOCK_SIGNALS}
            rowKey={(r) => r.id}
            searchText={(r) => `${r.symbol} ${r.strategy} ${r.action}`}
            searchPlaceholder="Search symbol or strategy"
            rowFilter={rowFilter}
            filters={
              <div className="w-full sm:w-40">
                <label htmlFor="signal-action" className="sr-only">
                  Filter by action
                </label>
                <Select id="signal-action" value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
                  <option value="ALL">All actions</option>
                  <option value="BUY">BUY</option>
                  <option value="SELL">SELL</option>
                  <option value="HOLD">HOLD</option>
                </Select>
              </div>
            }
            columns={[
              { header: "Candle", render: (r) => <span className="tabular-nums text-secondary">{r.time}</span> },
              { header: "Symbol", render: (r) => <span className="font-semibold">{r.symbol}</span> },
              { header: "Strategy", render: (r) => <span className="text-secondary">{r.strategy}</span> },
              { header: "Action", render: (r) => <StatusBadge tone={actionTone(r.action)}>{r.action}</StatusBadge> },
              { header: "Price", align: "right", render: (r) => formatPrice(r.price) },
            ]}
          />
        </SectionCard>
      </div>
    </>
  );
}
