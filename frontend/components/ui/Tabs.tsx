"use client";

import type { ReactNode } from "react";

export type TabDef = { id: string; label: string; badge?: ReactNode };

/** Simple accessible tab bar; the caller renders the active panel. */
export function Tabs({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`panel-${t.id}`}
            onClick={() => onChange(t.id)}
            className={`relative inline-flex h-11 shrink-0 items-center gap-2 px-4 text-sm font-medium transition-colors ${
              selected ? "text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
            {t.badge}
            {selected && <span aria-hidden="true" className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        );
      })}
    </div>
  );
}
