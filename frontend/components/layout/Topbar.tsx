"use client";

import { ChevronRight, Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { findNavItem } from "@/lib/nav";
import { BackendStatus } from "./BackendStatus";
import { MarketDataStatus } from "./MarketDataStatus";
import { ProfileMenu } from "./ProfileMenu";

export function Topbar({ onMenuClick, menuOpen = false }: { onMenuClick?: () => void; menuOpen?: boolean }) {
  const pathname = usePathname();
  const title = findNavItem(pathname)?.label ?? (pathname === "/change-password" ? "Change password" : "Not found");

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-header/85 backdrop-blur-md">
      <div className="flex min-h-[4.25rem] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          aria-expanded={menuOpen}
          aria-controls="primary-sidebar"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-elevated text-secondary transition-colors hover:text-foreground md:hidden"
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

        <div className="ml-auto hidden lg:block">
          <StatusBadge tone="info">PAPER TRADING ONLY</StatusBadge>
        </div>

        {/* Single instance: sits inline on lg+, wraps onto its own row below. */}
        <div className="flex flex-wrap items-center gap-2 max-lg:order-last max-lg:w-full">
          <MarketDataStatus />
          <BackendStatus />
        </div>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <ThemeToggle />
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}
