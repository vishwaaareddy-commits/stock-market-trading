"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, getCurrentTheme, setTheme, subscribeToTheme, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/**
 * Segmented light/dark control. State comes from <html data-theme> (set before paint by the
 * inline script), so server and first client render agree and nothing flashes.
 */
export function ThemeToggle({ showLabels = false }: { showLabels?: boolean }) {
  const theme = useSyncExternalStore(subscribeToTheme, getCurrentTheme, () => DEFAULT_THEME);

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="inline-flex h-9 items-center gap-0.5 rounded-lg border border-line bg-elevated p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setTheme(value)}
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors ${
              active
                ? "bg-accent text-on-accent"
                : "text-secondary hover:bg-surface hover:text-foreground"
            }`}
          >
            <Icon size={16} aria-hidden="true" />
            {showLabels && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
