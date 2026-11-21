import { Card } from "@/components/ui/Card";
import { MockDataNotice } from "@/components/ui/MockBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { NAV_ITEMS } from "@/lib/nav";
import { MOCK_OVERVIEW_STATS } from "@/lib/mock-data";
import Link from "next/link";

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Paper-trading summary. No live trading and no broker connection."
      />
      <div className="space-y-6">
        <MockDataNotice>
          Statistics below are placeholders. No strategy is running and no market data has been loaded.
        </MockDataNotice>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {MOCK_OVERVIEW_STATS.map((s) => (
            <StatCard key={s.label} {...s} mock />
          ))}
        </div>
        <Card title="Sections">
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {NAV_ITEMS.filter((i) => i.href !== "/").map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-md border border-line p-3 transition-colors hover:border-accent/50"
                >
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted">{item.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
