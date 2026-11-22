/** The product mark: three rising candlesticks on the brand gradient. Purely decorative. */
export function BrandMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-[28%] bg-brand shadow-glow ${className}`}
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round">
        <path d="M6 5v3M6 15v3" />
        <rect x="4" y="8" width="4" height="7" rx="1" fill="#fff" fillOpacity="0.92" stroke="none" />
        <path d="M12 3v4M12 17v4" />
        <rect x="10" y="7" width="4" height="10" rx="1" fill="#fff" fillOpacity="0.55" stroke="none" />
        <path d="M18 6v2M18 13v4" />
        <rect x="16" y="8" width="4" height="5" rx="1" fill="#fff" fillOpacity="0.92" stroke="none" />
      </svg>
    </span>
  );
}

export function BrandLockup({ size = 36, tagline = true }: { size?: number; tagline?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <BrandMark size={size} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-display text-[15px] font-semibold tracking-tight text-foreground">Trading System</span>
        {tagline && <span className="block truncate text-xs text-muted">NSE · Paper Trading</span>}
      </span>
    </span>
  );
}
