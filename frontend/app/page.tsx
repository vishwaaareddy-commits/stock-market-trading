"use client";

import { ArrowRight, Briefcase, Layers, TrendingDown, TrendingUp, Wallet, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ChartContainer } from "@/components/ui/ChartContainer";
import { LineChart } from "@/components/ui/LineChart";
import { cashSeries } from "@/lib/series";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { MockBadge, MockDataNotice } from "@/components/ui/MockBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge, actionTone } from "@/components/ui/StatusBadge";
import { formatPercent, formatPrice, valueTone } from "@/lib/format";
import {
  MOCK_INSTRUMENTS,
  MOCK_OVERVIEW_STATS,
  MOCK_SIGNALS,
} from "@/lib/mock-data";
import { VirtualBadge } from "@/components/ui/VirtualBadge";
import { formatCompact, formatSigned, formatVirtual, signTone } from "@/lib/money";
import { NAV_ITEMS } from "@/lib/nav";
import { useApi } from "@/lib/useApi";
import type { Position, Wallet as WalletData, WalletTx } from "@/lib/types";

const METRIC_ICONS: Record<string, LucideIcon> = {
  "Paper Equity": Wallet,
  "Open Positions": Briefcase,
  "Signals Today": Zap,
  "Active Strategies": Layers,
};

const TONE_TEXT = { positive: "text-positive", negative: "text-negative", neutral: "text-muted" } as const;

const PERFORMANCE_PLACEHOLDERS = [
  { label: "Total P&L", value: "—" },
  { label: "Win rate", value: "—" },
  { label: "Closed trades", value: "—" },
];

export default function OverviewPage() {
  const wallet = useApi<WalletData>("/wallet");
  const positions = useApi<Position[]>("/paper/positions");
  const ledger = useApi<WalletTx[]>("/wallet/transactions?limit=200");
  const series = cashSeries(ledger.data ?? []);
  const w = wallet.data;
  const open = positions.data;
  return (
    <>
      <PageHeader
        title="Overview"
        description="Paper-trading summary. No live trading and no broker connection."
      />
      <div className="space-y-6">
        <MockDataNotice>
Signals, strategies and market panels below are placeholders. Paper equity and open positions are real values from your virtual wallet.
        </MockDataNotice>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {/* Real, live values from the caller's VIRTUAL wallet */}
          <MetricCard
            label="Paper Equity"
            icon={Wallet}
            value={w ? formatVirtual(w.total_equity) : "…"}
            hint={w ? `Virtual · available ${formatVirtual(w.available_balance)}` : "Loading virtual wallet"}
          />
          <MetricCard
            label="Open Positions"
            icon={Briefcase}
            value={open ? String(open.length) : "…"}
            hint="Simulated, long-only"
          />
          {/* Still placeholders until strategies and signals exist */}
          {MOCK_OVERVIEW_STATS.slice(2).map((s) => (
            <MetricCard key={s.label} {...s} icon={METRIC_ICONS[s.label]} mock />
          ))}
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <ChartContainer
              title="Virtual cash balance"
              description="Available + reserved funds, from your wallet ledger"
              action={<VirtualBadge />}
              isEmpty={series.length < 2}
              emptyTitle={ledger.loading ? "Loading balance history…" : "No balance history yet"}
              emptyDescription="Your balance chart appears after your second wallet event (an allocation, an order or a fill)."
            >
              <LineChart points={series} format={formatCompact} label="Virtual cash balance over time" height={260} />
            </ChartContainer>
          </div>
          <SectionCard title="Performance summary" description="Closed paper trades only">
            <dl className="divide-y divide-line">
              {PERFORMANCE_PLACEHOLDERS.map((p) => (
                <div key={p.label} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <dt className="text-sm text-secondary">{p.label}</dt>
                  <dd className="text-sm font-semibold tabular-nums text-muted">{p.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-muted">No closed paper trades yet, so there is nothing to summarise.</p>
          </SectionCard>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-3">
          <SectionCard
            title="Recent signals"
            description="Latest strategy decisions"
            action={<MockBadge />}
            className="lg:col-span-2"
            flush
          >
            {MOCK_SIGNALS.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No signals yet" description="Signals appear when a strategy evaluates a completed candle." icon={Zap} />
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {MOCK_SIGNALS.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3.5">
                    <StatusBadge tone={actionTone(s.action)}>{s.action}</StatusBadge>
                    <span className="text-sm font-medium text-foreground">{s.symbol}</span>
                    <span className="hidden text-sm text-muted sm:inline">{s.strategy}</span>
                    <span className="ml-auto text-sm tabular-nums text-foreground">{formatPrice(s.price)}</span>
                    <span className="w-full text-xs tabular-nums text-muted sm:w-auto">{s.time}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Market overview" description="Sample instruments" action={<MockBadge />} flush>
            <ul className="divide-y divide-line">
              {MOCK_INSTRUMENTS.map((i) => {
                const tone = valueTone(i.changePct);
                const Trend = tone === "negative" ? TrendingDown : TrendingUp;
                return (
                  <li key={i.symbol} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{i.symbol}</p>
                      <p className="truncate text-xs text-muted">{i.exchange}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm tabular-nums text-foreground">{formatPrice(i.lastPrice)}</p>
                      <p className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${TONE_TEXT[tone]}`}>
                        <Trend size={12} aria-hidden="true" />
                        {formatPercent(i.changePct)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-3">
          <SectionCard
            title="Open positions"
            description="Simulated, long-only"
            action={<VirtualBadge />}
            className="lg:col-span-2"
            flush
          >
            {!open ? (
              <p className="px-5 py-8 text-center text-sm text-muted">Loading…</p>
            ) : open.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted">No open paper positions.</p>
            ) : (
              <ul className="divide-y divide-line">
                {open.map((p) => (
                  <li key={p.instrument_id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.symbol}</p>
                      <p className="text-xs tabular-nums text-muted">
                        {p.quantity} @ {formatVirtual(p.avg_entry_price)}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold tabular-nums ${TONE_TEXT[signTone(p.unrealized_pnl)]}`}>
                      {p.unrealized_pnl === null ? "—" : formatSigned(p.unrealized_pnl)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Sections">
            <ul className="space-y-1">
              {NAV_ITEMS.filter((i) => i.href !== "/").map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-elevated"
                  >
                    <item.icon size={16} aria-hidden="true" className="shrink-0 text-muted group-hover:text-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{item.label}</span>
                      <span className="block truncate text-xs text-muted">{item.description}</span>
                    </span>
                    <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
