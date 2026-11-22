"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Controls";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { VirtualBadge } from "@/components/ui/VirtualBadge";
import { WalletAdjustDialog } from "@/components/wallet/WalletAdjustDialog";
import { formatSigned, formatVirtual, signTone } from "@/lib/money";
import { useApi } from "@/lib/useApi";
import type { WalletRow } from "@/lib/types";

const TONE_TEXT = { positive: "text-positive", negative: "text-negative", neutral: "text-secondary" } as const;

export default function WalletsPage() {
  const { data, error, loading, reload } = useApi<WalletRow[]>("/admin/wallets");
  const [target, setTarget] = useState<{ id: number; username: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Wallets" description="Every account has its own virtual wallet. Only Super Admins can change balances.">
        <VirtualBadge />
      </PageHeader>
      <div className="space-y-6">
        <Notice tone="info">
          Balances are simulated paper-trading funds. Recharging or deducting never moves real money, and every change
          needs a reason and is written permanently to the ledger and audit log.
        </Notice>
        {notice && <Notice tone="success">{notice}</Notice>}
        <SectionCard title="All wallets" flush>
          {error ? (
            <div className="p-5"><Notice tone="error">{error.message}</Notice></div>
          ) : loading || !data ? (
            <div className="p-5"><LoadingState label="Loading wallets…" /></div>
          ) : (
            <DataTable
              caption="Virtual wallets"
              rows={data}
              rowKey={(r) => String(r.user_id)}
              emptyMessage="No wallets yet."
              searchText={(r) => r.username}
              searchPlaceholder="Search by username"
              columns={[
                {
                  header: "Account",
                  render: (r) => (
                    <Link href={`/admin/wallets/${r.user_id}`} className="font-medium text-accent hover:underline">
                      {r.username}
                    </Link>
                  ),
                },
                {
                  header: "Role",
                  render: (r) => <StatusBadge tone={r.role === "SUPER_ADMIN" ? "warning" : "neutral"}>{r.role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}</StatusBadge>,
                },
                { header: "State", render: (r) => (r.deleted ? <StatusBadge tone="negative">Deleted</StatusBadge> : r.is_active ? <StatusBadge tone="info">Active</StatusBadge> : <StatusBadge tone="warning">Deactivated</StatusBadge>) },
                { header: "Available", align: "right", render: (r) => formatVirtual(r.available_balance) },
                { header: "Reserved", align: "right", render: (r) => formatVirtual(r.reserved_balance) },
                { header: "Realized P&L", align: "right", render: (r) => <span className={TONE_TEXT[signTone(r.realized_pnl)]}>{formatSigned(r.realized_pnl)}</span> },
                {
                  header: "",
                  align: "right",
                  render: (r) =>
                    r.deleted ? null : (
                      <Button onClick={() => { setNotice(null); setTarget({ id: r.user_id, username: r.username }); }}>
                        Recharge / deduct
                      </Button>
                    ),
                },
              ]}
            />
          )}
        </SectionCard>
      </div>
      <WalletAdjustDialog
        open={target !== null}
        target={target}
        onClose={() => setTarget(null)}
        onDone={() => { setNotice("Virtual wallet updated."); reload(); }}
      />
    </>
  );
}
