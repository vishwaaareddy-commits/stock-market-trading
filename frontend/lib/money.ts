/** Formatting for VIRTUAL (paper) money. Values arrive as decimal strings from the backend. */

const FORMAT = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatVirtual(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isFinite(n) ? `₹${FORMAT.format(n)}` : "—";
}

export function formatSigned(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}₹${FORMAT.format(Math.abs(n))}`;
}

/** Compact axis label, e.g. ₹1.8L or ₹2.5Cr (Indian grouping). */
export function formatCompact(value: number): string {
  const n = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (n >= 1e7) return `${sign}₹${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, "")}Cr`;
  if (n >= 1e5) return `${sign}₹${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1).replace(/\.0$/, "")}L`;
  if (n >= 1e3) return `${sign}₹${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `${sign}₹${n.toFixed(0)}`;
}

export function signTone(value: string | null | undefined): "positive" | "negative" | "neutral" {
  const n = Number(value);
  return !Number.isFinite(n) || n === 0 ? "neutral" : n > 0 ? "positive" : "negative";
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function timeAgo(value: string | null | undefined, now: number = Date.now()): string {
  if (!value) return "Never";
  const seconds = Math.max(0, Math.round((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** True for a positive amount with at most 2 decimal places. */
export function isValidAmount(value: string): boolean {
  return /^\d{1,16}(\.\d{1,2})?$/.test(value.trim()) && Number(value) > 0;
}
