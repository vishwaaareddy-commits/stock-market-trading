import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { valueTone } from "@/lib/format";
import { MockBadge } from "./MockBadge";

type MetricCardProps = {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  mock?: boolean;
  /** Optional change indicator; only pass when real (or clearly mock) data supports it. */
  trend?: { value: number; label: string };
};

const TREND_STYLES = {
  positive: "text-positive",
  negative: "text-negative",
  neutral: "text-muted",
} as const;

export function MetricCard({ label, value, hint, icon: Icon, mock = false, trend }: MetricCardProps) {
  const tone = trend ? valueTone(trend.value) : "neutral";
  return (
    <div className="group relative min-w-0 overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5 transition-colors hover:border-accent/40">
      {/* ambient corner light */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-accent/10 blur-2xl transition-opacity group-hover:opacity-100" />
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:flex bg-gradient-to-br from-accent/20 to-accent-2/20 text-accent">
              <Icon size={17} aria-hidden="true" />
            </span>
          )}
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
        </div>
      </div>
      <p
        className={`relative mt-4 font-display font-semibold leading-tight tracking-tight text-foreground tabular-nums ${
          value.length > 14 ? "text-lg sm:text-xl" : "text-[22px] leading-none sm:text-[28px]"
        }`}
      >
        {value}
      </p>
      <div className="relative mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
        {trend && (
          <span className={`inline-flex items-center gap-1 font-medium ${TREND_STYLES[tone]}`}>
            {tone === "negative" ? <TrendingDown size={14} aria-hidden="true" /> : <TrendingUp size={14} aria-hidden="true" />}
            {trend.label}
          </span>
        )}
        {hint && <span className="text-muted">{hint}</span>}
        {mock && (
          <span className="ml-auto shrink-0">
            <MockBadge />
          </span>
        )}
      </div>
    </div>
  );
}
