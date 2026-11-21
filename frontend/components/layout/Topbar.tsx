import { BackendStatus } from "./BackendStatus";

export function Topbar() {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-6 py-3">
      <span className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-semibold tracking-wide text-sky-400">
        PAPER TRADING ONLY
      </span>
      <BackendStatus />
    </header>
  );
}
