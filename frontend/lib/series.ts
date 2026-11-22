import type { ChartPoint } from "@/components/ui/LineChart";
import type { WalletTx } from "./types";

/**
 * Virtual cash balance over time (available + reserved) built from the REAL wallet ledger.
 * The API returns newest first; the chart needs oldest first. Returns [] if there is nothing to plot.
 */
export function cashSeries(txs: WalletTx[]): ChartPoint[] {
  return [...txs]
    .reverse()
    .map((t) => ({ time: t.created_at, value: Number(t.available_after) + Number(t.reserved_after) }))
    .filter((p) => Number.isFinite(p.value));
}
