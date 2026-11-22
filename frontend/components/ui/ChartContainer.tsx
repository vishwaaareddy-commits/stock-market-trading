import { LineChart } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";
import { MockBadge } from "./MockBadge";
import { SectionCard } from "./SectionCard";

type ChartContainerProps = {
  title: string;
  description?: string;
  /** True when there is no data to plot; an empty state is shown instead of the chart. */
  isEmpty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  mock?: boolean;
  height?: number;
  children?: ReactNode;
};

/**
 * Theme-aware frame for charts. Chart libraries should style themselves with the CSS
 * variables --chart-grid, --chart-axis, --chart-tooltip-bg, --chart-tooltip-border,
 * --positive, --negative and --accent, which change with the active theme automatically.
 */
export function ChartContainer({
  title,
  description,
  isEmpty = false,
  emptyTitle = "No data to chart yet",
  emptyDescription = "This chart will populate once data is available.",
  mock = false,
  height = 280,
  children,
}: ChartContainerProps) {
  return (
    <SectionCard title={title} description={description} action={mock ? <MockBadge /> : undefined}>
      {isEmpty || !children ? (
        <EmptyState title={emptyTitle} description={emptyDescription} icon={LineChart} />
      ) : (
        <div style={{ height }} className="w-full min-w-0">
          {children}
        </div>
      )}
    </SectionCard>
  );
}
