import { MockBadge } from "./MockBadge";

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  mock?: boolean;
};

export function StatCard({ label, value, hint, mock = false }: StatCardProps) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {mock && <MockBadge />}
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
