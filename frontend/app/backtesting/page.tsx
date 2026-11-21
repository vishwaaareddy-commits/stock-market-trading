import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

export default function BacktestingPage() {
  return (
    <>
      <PageHeader title="Backtesting" description="Run strategies against historical candles." />
      <Card title="Backtests">
        <EmptyState
          title="No backtests yet"
          description="Backtesting is not implemented. It will reuse the same strategy plug-ins as paper trading."
        />
      </Card>
    </>
  );
}
