"use client";

import { useState } from "react";
import { OrderForm } from "@/components/paper/OrderForm";
import { Button } from "@/components/ui/Controls";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { VirtualBadge } from "@/components/ui/VirtualBadge";
import { WalletSummary } from "@/components/wallet/WalletSummary";
import { HttpError, api } from "@/lib/client";
import { formatDateTime, formatSigned, formatVirtual, signTone } from "@/lib/money";
import { useApi } from "@/lib/useApi";
import type { Order, Position, Wallet } from "@/lib/types";

const TONE_TEXT = { positive: "text-positive", negative: "text-negative", neutral: "text-secondary" } as const;
const ORDER_TONE: Record<Order["status"], BadgeTone> = {
  PENDING: "info",
  FILLED: "positive",
  CANCELLED: "neutral",
  REJECTED: "negative",
};

export default function PaperTradingPage() {
  const wallet = useApi<Wallet>("/wallet");
  const positions = useApi<Position[]>("/paper/positions");
  const orders = useApi<Order[]>("/paper/orders?limit=100");
  const [cancelError, setCancelError] = useState<string | null>(null);

  function refresh() {
    wallet.reload();
    positions.reload();
    orders.reload();
  }

  async function cancel(id: number) {
    setCancelError(null);
    try {
      await api(`/paper/orders/${id}/cancel`, { method: "POST" });
      refresh();
    } catch (err) {
      setCancelError(err instanceof HttpError ? err.message : "Could not cancel the order.");
    }
  }

  return (
    <>
      <PageHeader
        title="Paper Trading"
        description="Simulated, long-only positions funded by your virtual wallet. Orders are never sent to a broker."
      >
        <VirtualBadge />
      </PageHeader>
      <div className="space-y-6">
        {wallet.error ? (
          <Notice tone="error">{wallet.error.message}</Notice>
        ) : wallet.loading || !wallet.data ? (
          <LoadingState label="Loading wallet…" />
        ) : (
          <WalletSummary wallet={wallet.data} />
        )}

        <SectionCard title="New paper order" description="BUY reserves funds; they are released if the order is cancelled or rejected">
          <OrderForm onPlaced={refresh} />
        </SectionCard>

        <SectionCard title="Open positions" description="Your simulated holdings" action={<VirtualBadge />} flush>
          {positions.error ? (
            <div className="p-5"><Notice tone="error">{positions.error.message}</Notice></div>
          ) : positions.loading || !positions.data ? (
            <div className="p-5"><LoadingState /></div>
          ) : (
            <DataTable
              caption="Open positions"
              rows={positions.data}
              rowKey={(r) => String(r.instrument_id)}
              searchText={(r) => r.symbol}
              searchPlaceholder="Search symbol"
              emptyMessage="No open paper positions."
              columns={[
                { header: "Symbol", render: (r) => <span className="font-semibold">{r.symbol}</span> },
                { header: "Qty", align: "right", render: (r) => r.quantity },
                { header: "Avg entry", align: "right", render: (r) => formatVirtual(r.avg_entry_price) },
                { header: "Last", align: "right", render: (r) => formatVirtual(r.last_price) },
                {
                  header: "Unrealized P&L",
                  align: "right",
                  render: (r) =>
                    r.unrealized_pnl === null ? (
                      <span className="text-muted" title="No market price available">—</span>
                    ) : (
                      <span className={`font-semibold ${TONE_TEXT[signTone(r.unrealized_pnl)]}`}>{formatSigned(r.unrealized_pnl)}</span>
                    ),
                },
              ]}
            />
          )}
        </SectionCard>

        <SectionCard title="Your orders" description="Most recent first" action={<VirtualBadge />} flush>
          {cancelError && <div className="p-5 pb-0"><Notice tone="error">{cancelError}</Notice></div>}
          {orders.error ? (
            <div className="p-5"><Notice tone="error">{orders.error.message}</Notice></div>
          ) : orders.loading || !orders.data ? (
            <div className="p-5"><LoadingState /></div>
          ) : (
            <DataTable
              caption="Your paper orders"
              rows={orders.data}
              rowKey={(r) => String(r.id)}
              emptyMessage="You have not placed any paper orders yet."
              searchText={(r) => `${r.id} ${r.side} ${r.status}`}
              searchPlaceholder="Search orders"
              columns={[
                { header: "#", render: (r) => r.id },
                { header: "Placed", render: (r) => <span className="text-secondary">{formatDateTime(r.created_at)}</span> },
                { header: "Side", render: (r) => <StatusBadge tone={r.side === "BUY" ? "positive" : "negative"}>{r.side}</StatusBadge> },
                { header: "Qty", align: "right", render: (r) => r.quantity },
                { header: "Limit", align: "right", render: (r) => formatVirtual(r.limit_price) },
                { header: "Status", render: (r) => <StatusBadge tone={ORDER_TONE[r.status]}>{r.status}</StatusBadge> },
                { header: "Note", render: (r) => <span className="text-muted">{r.status_reason ?? ""}</span> },
                {
                  header: "",
                  align: "right",
                  render: (r) =>
                    r.status === "PENDING" ? <Button onClick={() => cancel(r.id)}>Cancel</Button> : null,
                },
              ]}
            />
          )}
        </SectionCard>
      </div>
    </>
  );
}
