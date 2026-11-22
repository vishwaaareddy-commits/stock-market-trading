import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { API_BASE_URL } from "@/lib/api";

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <dt className="text-sm font-medium text-foreground">{label}</dt>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      <dd className="min-w-0 text-sm text-secondary">{children}</dd>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Application configuration for this build." />
      <div className="space-y-6">
        <SectionCard title="Appearance" description="Saved in this browser and applied instantly">
          <dl>
            <Row label="Theme" hint="Dark is the default.">
              <ThemeToggle showLabels />
            </Row>
          </dl>
        </SectionCard>

        <SectionCard title="Environment" description="Read-only">
          <dl className="divide-y divide-line">
            <Row label="Trading mode" hint="Live trading is not available.">
              <StatusBadge tone="info" dot>
                Paper only
              </StatusBadge>
            </Row>
            <Row label="API base URL">
              <code className="break-all rounded bg-elevated px-2 py-1 font-mono text-xs text-foreground">
                {API_BASE_URL}
              </code>
            </Row>
          </dl>
        </SectionCard>
      </div>
    </>
  );
}
