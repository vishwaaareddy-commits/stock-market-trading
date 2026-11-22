import { StatusBadge } from "@/components/ui/StatusBadge";
import type { AdminRow } from "@/lib/types";

export function PresenceBadge({ online }: { online: boolean }) {
  return (
    <StatusBadge tone={online ? "positive" : "neutral"} dot>
      {online ? "Online" : "Offline"}
    </StatusBadge>
  );
}

export function AccountBadge({ row }: { row: Pick<AdminRow, "is_active" | "deleted_at"> }) {
  if (row.deleted_at) return <StatusBadge tone="negative">Deleted</StatusBadge>;
  return row.is_active ? <StatusBadge tone="info">Active</StatusBadge> : <StatusBadge tone="warning">Deactivated</StatusBadge>;
}
