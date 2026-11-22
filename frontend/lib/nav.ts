import {
  Banknote,
  CandlestickChart,
  FlaskConical,
  Layers,
  LayoutDashboard,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  WalletCards,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./types";

export type NavItem = {
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
  /** Match the path exactly (needed for section roots like /admin). */
  exact?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

// Trading workspace: the seven original sections, available to every signed-in user.
export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", description: "System summary and status", icon: LayoutDashboard },
  { label: "Strategies", href: "/strategies", description: "Configure and manage strategies", icon: Layers },
  { label: "Market Data", href: "/market-data", description: "Instruments and candles", icon: CandlestickChart },
  { label: "Signals", href: "/signals", description: "Strategy decisions per candle", icon: Zap },
  { label: "Paper Trading", href: "/paper-trading", description: "Simulated orders and positions", icon: Wallet },
  { label: "Backtesting", href: "/backtesting", description: "Test strategies on history", icon: FlaskConical },
  { label: "Settings", href: "/settings", description: "Application configuration", icon: Settings },
];

export const WALLET_NAV: NavItem = {
  label: "My Wallet",
  href: "/wallet",
  description: "Virtual balance and ledger",
  icon: WalletCards,
};

// Super Admin control area. Never shown to (or reachable by) normal Admins; the backend enforces it.
export const ADMIN_NAV: NavItem[] = [
  { label: "Control Centre", href: "/admin", description: "Admin activity and status", icon: ShieldCheck, exact: true },
  { label: "Admins", href: "/admin/users", description: "Create and manage admin accounts", icon: Users },
  { label: "Wallets", href: "/admin/wallets", description: "Recharge or deduct virtual funds", icon: Banknote },
  { label: "Audit Log", href: "/admin/audit", description: "Complete action history", icon: ScrollText },
];

/** Strictly separate navigation per role. */
export function navFor(role: Role | undefined): NavGroup[] {
  const trading: NavGroup = { label: "Trading", items: [...NAV_ITEMS, WALLET_NAV] };
  if (role === "SUPER_ADMIN") return [{ label: "Super Admin", items: ADMIN_NAV }, trading];
  return [trading];
}

export function isActive(pathname: string, href: string, exact = false): boolean {
  if (href === "/" || exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ALL_ITEMS = [...NAV_ITEMS, WALLET_NAV, ...ADMIN_NAV];

export function findNavItem(pathname: string): NavItem | undefined {
  // Prefer the longest matching href so /admin/users beats /admin.
  return ALL_ITEMS.filter((i) => isActive(pathname, i.href, i.exact)).sort((a, b) => b.href.length - a.href.length)[0];
}
