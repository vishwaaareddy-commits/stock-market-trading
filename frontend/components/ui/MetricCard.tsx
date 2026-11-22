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
    <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Icon size={16} aria-hidden="true" />
            </span>
          )}
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        </div>
        {mock && <MockBadge />}
      </div>
      <p className="mt-4 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        {trend && (
          <span className={`inline-flex items-center gap-1 font-medium ${TREND_STYLES[tone]}`}>
            {tone === "negative" ? (
              <TrendingDown size={14} aria-hidden="true" />
            ) : (
              <TrendingUp size={14} aria-hidden="true" />
            )}
            {trend.label}
          </span>
        )}
        {hint && <span className="text-muted">{hint}</span>}
      </div>
    </div>
  );
}
