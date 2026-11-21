import type { ReactNode } from "react";

export function MockBadge({ label = "MOCK DATA" }: { label?: string }) {
  return (
    <span
      title="Placeholder content, not real market data"
      className="inline-flex items-center rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-amber-400"
    >
      {label}
    </span>
  );
}

export function MockDataNotice({ children }: { children?: ReactNode }) {
  return (
    <div
      role="note"
      className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-200"
    >
      <MockBadge />
      <p>
        {children ??
          "Values on this page are placeholders for layout purposes. They are not real market data."}
      </p>
    </div>
  );
}
