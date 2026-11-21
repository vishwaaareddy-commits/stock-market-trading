import { BackendStatus } from "./BackendStatus";
import { MarketDataStatus } from "./MarketDataStatus";

export function Topbar() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-6 py-3">
      <span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-semibold tracking-wide text-sky-400">
        PAPER TRADING ONLY
      </span>
      <div className="flex flex-wrap items-center gap-4">
        <MarketDataStatus />
        <BackendStatus />
      </div>
    </header>
  );
}
