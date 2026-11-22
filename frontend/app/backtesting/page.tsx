import { FlaskConical } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui/Controls";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";

export default function BacktestingPage() {
  return (
    <>
      <PageHeader title="Backtesting" description="Run strategies against historical candles." />
      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard
          title="Configuration"
          description="Disabled until backtesting is implemented"
          action={<StatusBadge tone="warning">Not available</StatusBadge>}
        >
          <form className="space-y-4" aria-label="Backtest configuration (disabled)">
            <fieldset disabled className="space-y-4">
              <Field label="Strategy" htmlFor="bt-strategy">
                <Select id="bt-strategy" defaultValue="">
                  <option value="">Select a strategy</option>
                </Select>
              </Field>
              <Field label="Instrument" htmlFor="bt-instrument">
                <Input id="bt-instrument" placeholder="e.g. a listed NSE symbol" />
              </Field>
              <Field label="Timeframe" htmlFor="bt-timeframe">
                <Select id="bt-timeframe" defaultValue="15m">
                  <option value="15m">15 minutes</option>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From" htmlFor="bt-from">
                  <Input id="bt-from" type="date" />
                </Field>
                <Field label="To" htmlFor="bt-to">
                  <Input id="bt-to" type="date" />
                </Field>
              </div>
              <Button variant="primary" className="w-full" type="submit">
                Run backtest
              </Button>
            </fieldset>
          </form>
        </SectionCard>

        <SectionCard title="Backtests" description="Results will be listed here" className="lg:col-span-2">
          <EmptyState
            icon={FlaskConical}
            title="No backtests yet"
            description="Backtesting is not implemented. It will reuse the same strategy plug-ins as paper trading."
          />
        </SectionCard>
      </div>
    </>
  );
}
