export type NavItem = {
  label: string;
  href: string;
  description: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", description: "System summary and status" },
  { label: "Strategies", href: "/strategies", description: "Configure and manage strategies" },
  { label: "Market Data", href: "/market-data", description: "Instruments and candles" },
  { label: "Signals", href: "/signals", description: "Strategy decisions per candle" },
  { label: "Paper Trading", href: "/paper-trading", description: "Simulated orders and positions" },
  { label: "Backtesting", href: "/backtesting", description: "Test strategies on history" },
  { label: "Settings", href: "/settings", description: "Application configuration" },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
