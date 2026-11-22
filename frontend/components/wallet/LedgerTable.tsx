"use client";

import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { formatDateTime, formatSigned, formatVirtual, signTone } from "@/lib/money";
import type { WalletTx } from "@/lib/types";

const TYPE_TONE: Record<WalletTx["type"], BadgeTone> = {
  INITIAL_CREDIT: "positive",
  ADMIN_RECHARGE: "positive",
  ADMIN_ADJUSTMENT: "warning",
  TRADE_BUY: "info",
  TRADE_SELL: "info",
  TRADE_CHARGE: "neutral",
  TRADE_REFUND: "neutral",
};
const TONE_TEXT = { positive: "text-positive", negative: "text-negative", neutral: "text-secondary" } as const;

export function LedgerTable({ rows }: { rows: WalletTx[] }) {
  return (
    <DataTable
      caption="Wallet ledger (virtual funds)"
      rows={rows}
      rowKey={(r) => r.id}
      emptyMessage="No wallet transactions yet."
      searchText={(r) => `${r.type} ${r.description} ${r.id}`}
      searchPlaceholder="Search ledger"
      columns={[
        { header: "Time", render: (r) => <span className="whitespace-nowrap text-secondary">{formatDateTime(r.created_at)}</span> },
        { header: "Type", render: (r) => <StatusBadge tone={TYPE_TONE[r.type]}>{r.type.replace("_", " ")}</StatusBadge> },
        {
          header: "Change",
          align: "right",
          render: (r) => (
            <span className={`font-medium ${TONE_TEXT[signTone(r.amount)]}`}>
              {Number(r.amount) === 0 && Number(r.reserved_delta) !== 0
                ? `Reserved ${formatSigned(r.reserved_delta)}`
                : formatSigned(r.amount)}
            </span>
          ),
        },
        { header: "Available after", align: "right", render: (r) => formatVirtual(r.available_after) },
        { header: "Reserved after", align: "right", hideBelow: "xl", render: (r) => formatVirtual(r.reserved_after) },
        { header: "Description", hideBelow: "lg", render: (r) => <span className="block max-w-[18rem] whitespace-normal text-secondary max-md:max-w-none">{r.description}</span> },
        { header: "Txn ID", hideBelow: "2xl", render: (r) => <code className="font-mono text-[11px] text-muted">{r.id.slice(0, 8)}</code> },
      ]}
    />
  );
}
