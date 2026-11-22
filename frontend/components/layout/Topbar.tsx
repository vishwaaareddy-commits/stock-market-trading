"use client";

import { ChevronRight, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { findNavItem } from "@/lib/nav";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { BackendStatus } from "./BackendStatus";
import { MarketDataStatus } from "./MarketDataStatus";

export function Topbar({ onMenuClick, menuOpen = false }: { onMenuClick?: () => void; menuOpen?: boolean }) {
  const pathname = usePathname();
  const title = findNavItem(pathname)?.label ?? "Not found";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-header">
      <div className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 sm:px-6">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          aria-controls="primary-sidebar"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-elevated text-secondary transition-colors hover:text-foreground md:hidden"
        >
          <Menu size={18} aria-hidden="true" />
        </button>

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="hidden text-muted sm:inline">Trading System</span>
          <ChevronRight size={14} aria-hidden="true" className="hidden text-muted sm:inline" />
          <span className="truncate font-medium text-foreground" aria-current="page">
            {title}
          </span>
        </nav>

        <div className="ml-auto">
          <StatusBadge tone="info">PAPER TRADING ONLY</StatusBadge>
        </div>

        {/* Single instance: sits inline on md+, wraps onto its own row below md. */}
        <div className="flex flex-wrap items-center gap-2 max-md:order-last max-md:w-full">
          <MarketDataStatus />
          <BackendStatus />
        </div>

        <ThemeToggle />
      </div>
    </header>
  );
}
