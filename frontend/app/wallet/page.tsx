"use client";

import { ChartContainer } from "@/components/ui/ChartContainer";
import { LineChart } from "@/components/ui/LineChart";
import { LedgerTable } from "@/components/wallet/LedgerTable";
import { WalletSummary } from "@/components/wallet/WalletSummary";
import { LoadingState } from "@/components/ui/LoadingState";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { VirtualBadge } from "@/components/ui/VirtualBadge";
import { formatCompact } from "@/lib/money";
import { cashSeries } from "@/lib/series";
import { useApi } from "@/lib/useApi";
import type { Wallet, WalletTx } from "@/lib/types";

export default function MyWalletPage() {
  const wallet = useApi<Wallet>("/wallet");
  const txs = useApi<WalletTx[]>("/wallet/transactions?limit=200");

  return (
    <>
      <PageHeader title="My Wallet" description="Your individual virtual trading balance and its permanent ledger.">
        <VirtualBadge />
      </PageHeader>
      <div className="space-y-6">
        <Notice tone="info">
          These are simulated funds for paper trading. They are not real money, and no bank or broker is connected.
          Only a Super Admin can add or remove virtual funds.
        </Notice>
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
          action={<VirtualBadge />}
          isEmpty={!txs.data || txs.data.length < 2}
          emptyTitle={txs.loading ? "Loading balance history…" : "No balance history yet"}
          emptyDescription="The chart appears after your second wallet event."
        >
          <LineChart points={cashSeries(txs.data ?? [])} format={formatCompact} label="Virtual cash balance over time" />
        </ChartContainer>
        <SectionCard title="Transaction history" description="Append-only; entries cannot be edited or deleted" flush>
          {txs.error ? (
            <div className="p-5">
              <Notice tone="error">{txs.error.message}</Notice>
            </div>
          ) : txs.loading || !txs.data ? (
            <div className="p-5">
              <LoadingState label="Loading transactions…" />
            </div>
          ) : (
            <LedgerTable rows={txs.data} />
          )}
        </SectionCard>
      </div>
    </>
  );
}
