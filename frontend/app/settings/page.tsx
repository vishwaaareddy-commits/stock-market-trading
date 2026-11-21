import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { API_BASE_URL } from "@/lib/api";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Read-only configuration for this build." />
      <Card title="Environment">
        <dl className="grid gap-3 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="text-muted">Trading mode</dt>
          <dd>Paper only (live trading is not available)</dd>
          <dt className="text-muted">API base URL</dt>
          <dd className="font-mono">{API_BASE_URL}</dd>
        </dl>
      </Card>
    </>
  );
}
