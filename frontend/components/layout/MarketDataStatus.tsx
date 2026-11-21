/**
 * Market-data provider status. No provider (e.g. Upstox) is integrated, so this is
 * deliberately static and never claims a connection. Wire it to real status once an
 * authenticated, tested integration exists.
 */
export function MarketDataStatus() {
  return (
    <span role="status" aria-label="Market data provider status" className="inline-flex items-center gap-2 text-xs text-muted">
      <span className="h-2 w-2 rounded-full bg-zinc-500" aria-hidden="true" />
      Market data: not connected
    </span>
  );
}
