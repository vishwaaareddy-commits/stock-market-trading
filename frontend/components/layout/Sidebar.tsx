"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "@/lib/nav";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-line bg-surface md:min-h-screen md:w-56 md:border-b-0 md:border-r">
      <div className="px-4 py-4">
        <p className="text-sm font-semibold text-foreground">Trading System</p>
        <p className="text-xs text-muted">NSE · Paper mode</p>
      </div>
      <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-accent/15 font-medium text-accent"
                  : "text-muted hover:bg-white/5 hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
