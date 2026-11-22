import {
  CandlestickChart,
  FlaskConical,
  Layers,
  LayoutDashboard,
  Settings,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", description: "System summary and status", icon: LayoutDashboard },
  { label: "Strategies", href: "/strategies", description: "Configure and manage strategies", icon: Layers },
  { label: "Market Data", href: "/market-data", description: "Instruments and candles", icon: CandlestickChart },
  { label: "Signals", href: "/signals", description: "Strategy decisions per candle", icon: Zap },
  { label: "Paper Trading", href: "/paper-trading", description: "Simulated orders and positions", icon: Wallet },
  { label: "Backtesting", href: "/backtesting", description: "Test strategies on history", icon: FlaskConical },
  { label: "Settings", href: "/settings", description: "Application configuration", icon: Settings },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => isActive(pathname, item.href));
}
