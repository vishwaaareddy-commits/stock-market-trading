export function LoadingState({ label = "Loading…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 py-2">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="skeleton h-4 rounded-md bg-elevated"
          style={{ width: `${92 - i * 14}%` }}
        />
      ))}
    </div>
  );
}
