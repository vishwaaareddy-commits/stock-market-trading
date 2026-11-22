"use client";

import { ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandLockup } from "@/components/brand/BrandMark";
import { isActive, navFor } from "@/lib/nav";

type SidebarProps = {
  /** Mobile drawer state. On desktop the sidebar is always visible. */
  open?: boolean;
  onClose?: () => void;
};

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const closeRef = useRef<HTMLButtonElement>(null);
  const groups = navFor(user?.role);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  return (
    <aside
      id="primary-sidebar"
      aria-label="Sidebar"
      className={`fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col border-r border-line bg-sidebar transition-[transform,visibility] duration-200 md:sticky md:top-0 md:h-screen md:visible md:translate-x-0 md:shrink-0 ${
        open ? "translate-x-0 shadow-pop" : "invisible -translate-x-full"
      }`}
    >
      <div className="flex h-[4.25rem] items-center justify-between gap-3 border-b border-line px-5">
        <Link href="/" onClick={onClose} className="min-w-0 rounded-lg">
          <BrandLockup />
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

      <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((group) => (
          <div key={group.label} role="group" aria-label={group.label}>
            {groups.length > 1 && (
              <p className="mb-2 px-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">{group.label}</p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(pathname, item.href, item.exact);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-all duration-150 ${
                      active
                        ? "bg-gradient-to-r from-accent/[0.14] to-accent-2/[0.08] font-medium text-foreground"
                        : "text-secondary hover:bg-elevated hover:text-foreground"
                    }`}
                  >
                    {active && (
                      <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand shadow-glow" />
                    )}
                    <Icon
                      size={18}
                      aria-hidden="true"
                      className={`shrink-0 transition-colors ${active ? "text-accent" : "group-hover:text-accent"}`}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4">
        <div className="rounded-xl border border-line bg-hero p-3.5 text-xs leading-relaxed text-secondary">
          <div className="mb-1.5 flex items-center gap-2 font-medium text-foreground">
            <ShieldCheck size={15} aria-hidden="true" className="text-positive" />
            Paper trading only
          </div>
          <p>Simulated trading only. Balances are virtual. No real money and no broker orders.</p>
        </div>
      </div>
    </aside>
  );
}
