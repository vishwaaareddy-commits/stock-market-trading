import { ArrowRight, Briefcase, Layers, TrendingDown, TrendingUp, Wallet, Zap, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ChartContainer } from "@/components/ui/ChartContainer";
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
  MOCK_POSITIONS,
  MOCK_SIGNALS,
} from "@/lib/mock-data";
import { NAV_ITEMS } from "@/lib/nav";

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
  return (
    <>
      <PageHeader
        title="Overview"
        description="Paper-trading summary. No live trading and no broker connection."
      />
      <div className="space-y-6">
        <MockDataNotice>
          Figures below are placeholders. No strategy is running and no market data has been loaded.
        </MockDataNotice>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {MOCK_OVERVIEW_STATS.map((s) => (
            <MetricCard key={s.label} {...s} icon={METRIC_ICONS[s.label]} mock />
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartContainer
              title="Equity curve"
              description="Paper account value over time"
              isEmpty
              emptyTitle="No equity history yet"
              emptyDescription="The equity curve appears after the first closed paper trade."
            />
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

        <div className="grid gap-6 lg:grid-cols-3">
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

        <div className="grid gap-6 lg:grid-cols-3">
          <SectionCard
            title="Open positions"
            description="Simulated, long-only"
            action={<MockBadge />}
            className="lg:col-span-2"
            flush
          >
            <ul className="divide-y divide-line">
              {MOCK_POSITIONS.map((p) => {
                const pnl = (p.lastPrice - p.entryPrice) * p.quantity;
                return (
                  <li key={p.symbol} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.symbol}</p>
                      <p className="text-xs tabular-nums text-muted">
                        {p.quantity} @ {formatPrice(p.entryPrice)}
                      </p>
                    </div>
                    <p className={`text-sm font-semibold tabular-nums ${TONE_TEXT[valueTone(pnl)]}`}>
                      {formatPrice(pnl)}
                    </p>
                  </li>
                );
              })}
            </ul>
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
