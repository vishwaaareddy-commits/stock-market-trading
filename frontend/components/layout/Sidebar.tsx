"use client";

import { CandlestickChart, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { NAV_ITEMS, isActive } from "@/lib/nav";

type SidebarProps = {
  /** Mobile drawer state. On desktop the sidebar is always visible. */
  open?: boolean;
  onClose?: () => void;
};

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  return (
    <aside
      id="primary-sidebar"
      aria-label="Sidebar"
      className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-line bg-sidebar transition-[transform,visibility] duration-200 md:sticky md:top-0 md:h-screen md:visible md:translate-x-0 md:shrink-0 ${
        open ? "translate-x-0 shadow-pop" : "invisible -translate-x-full"
      }`}
    >
      <div className="flex h-16 items-center justify-between gap-3 border-b border-line px-5">
        <Link href="/" onClick={onClose} className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent">
            <CandlestickChart size={20} aria-hidden="true" />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold text-foreground">Trading System</span>
            <span className="block truncate text-xs text-muted">NSE · Paper Trading</span>
          </span>
        </Link>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-secondary transition-colors hover:bg-elevated hover:text-foreground md:hidden"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={active ? "page" : undefined}
              className={`group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                active
                  ? "bg-accent/10 font-medium text-accent"
                  : "text-secondary hover:bg-elevated hover:text-foreground"
              }`}
            >
              {active && (
                <span aria-hidden="true" className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
              )}
              <Icon size={18} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line p-4">
        <div className="flex items-start gap-2.5 rounded-lg bg-elevated p-3 text-xs text-secondary">
          <ShieldCheck size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-positive" />
          <p>Simulated trading only. No real money and no broker orders.</p>
        </div>
      </div>
    </aside>
  );
}
