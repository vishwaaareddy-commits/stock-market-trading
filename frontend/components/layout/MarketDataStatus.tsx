/**
 * Market-data provider status. This indicator is deliberately static: it never claims a
 * provider is connected, and it is independent of the backend API status. Wire it to the
 * backend's provider-status endpoint only once that connection is verified end to end.
 */
export function MarketDataStatus() {
  return (
    <span
      role="status"
      aria-label="Market data provider status"
      className="inline-flex h-7 items-center gap-2 rounded-full border border-line bg-elevated px-3 text-xs font-medium text-secondary"
    >
      <span className="h-2 w-2 rounded-full bg-muted" aria-hidden="true" />
      Market data: not connected
    </span>
  );
}
