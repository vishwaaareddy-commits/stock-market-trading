"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Controls";
import { LoadingState } from "@/components/ui/LoadingState";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { VirtualBadge } from "@/components/ui/VirtualBadge";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { LineChart } from "@/components/ui/LineChart";
import { LedgerTable } from "@/components/wallet/LedgerTable";
import { WalletAdjustDialog } from "@/components/wallet/WalletAdjustDialog";
import { WalletSummary } from "@/components/wallet/WalletSummary";
import { formatCompact } from "@/lib/money";
import { cashSeries } from "@/lib/series";
import { useApi } from "@/lib/useApi";
import type { AdminRow, Wallet, WalletTx } from "@/lib/types";

/** Individual wallet page for one account (Super Admin view). */
export default function UserWalletPage() {
  const { id } = useParams<{ id: string }>();
  const wallet = useApi<Wallet>(`/admin/wallets/${id}`);
  const txs = useApi<WalletTx[]>(`/admin/wallets/${id}/transactions?limit=200`);
  const owner = useApi<AdminRow>(`/admin/users/${id}`); // 404 for a Super Admin; name falls back to the id
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const name = owner.data?.username ?? `account ${id}`;
  const deleted = Boolean(owner.data?.deleted_at);

  return (
    <>
      <PageHeader title={`Wallet · ${name}`} description="Virtual balance, reservations and the complete ledger.">
        <div className="flex items-center gap-2">
          <VirtualBadge />
          <Link href="/admin/wallets" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-secondary hover:bg-elevated hover:text-foreground">
            <ArrowLeft size={16} aria-hidden="true" /> All wallets
          </Link>
          {!deleted && (
            <Button variant="primary" onClick={() => { setDone(false); setOpen(true); }}>
              Recharge / deduct
            </Button>
          )}
        </div>
      </PageHeader>
      <div className="space-y-6">
        {done && <Notice tone="success">Virtual wallet updated.</Notice>}
        {wallet.error ? (
          <Notice tone="error">{wallet.error.message}</Notice>
        ) : wallet.loading || !wallet.data ? (
          <LoadingState label="Loading wallet…" />
        ) : (
          <WalletSummary wallet={wallet.data} />
        )}
        <ChartContainer
          title="Balance over time"
          description="Available + reserved virtual funds after each ledger entry"
          isEmpty={!txs.data || txs.data.length < 2}
          emptyTitle={txs.loading ? "Loading balance history…" : "No balance history yet"}
          emptyDescription="The chart appears after this wallet's second event."
        >
          <LineChart points={cashSeries(txs.data ?? [])} format={formatCompact} label="Virtual cash balance over time" />
        </ChartContainer>
        <SectionCard title="Transaction history" description="Append-only ledger; preserved after deactivation or deletion" flush>
          {txs.error ? (
            <div className="p-5"><Notice tone="error">{txs.error.message}</Notice></div>
          ) : txs.loading || !txs.data ? (
            <div className="p-5"><LoadingState label="Loading transactions…" /></div>
          ) : (
            <LedgerTable rows={txs.data} />
          )}
        </SectionCard>
      </div>
      <WalletAdjustDialog
        open={open}
        target={{ id: Number(id), username: name }}
        onClose={() => setOpen(false)}
        onDone={() => { setDone(true); wallet.reload(); txs.reload(); }}
      />
    </>
  );
}
