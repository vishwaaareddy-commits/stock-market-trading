import { FlaskConical } from "lucide-react";
import type { ReactNode } from "react";

export function MockBadge({ label = "MOCK DATA" }: { label?: string }) {
  return (
    <span
      title="Placeholder content, not real market data"
      className="inline-flex h-5 items-center rounded border border-warning/40 bg-warning/10 px-1.5 text-[10px] font-semibold tracking-wider text-warning"
    >
      {label}
    </span>
  );
}

export function MockDataNotice({ children }: { children?: ReactNode }) {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-secondary"
    >
      <FlaskConical size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
      <p className="min-w-0">
        <MockBadge /> <span className="ml-1">
          {children ??
            "Values on this page are placeholders for layout purposes. They are not real market data."}
        </span>
      </p>
    </div>
  );
}
