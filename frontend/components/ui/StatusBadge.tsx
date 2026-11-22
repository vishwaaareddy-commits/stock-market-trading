import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "positive" | "negative" | "warning" | "info";

const TONES: Record<BadgeTone, { box: string; dot: string }> = {
  neutral: { box: "border-line bg-elevated text-secondary", dot: "bg-muted" },
  positive: { box: "border-positive/30 bg-positive/10 text-positive", dot: "bg-positive" },
  negative: { box: "border-negative/30 bg-negative/10 text-negative", dot: "bg-negative" },
  warning: { box: "border-warning/30 bg-warning/10 text-warning", dot: "bg-warning" },
  info: { box: "border-accent/30 bg-accent/10 text-accent", dot: "bg-accent" },
};

export function StatusBadge({
  tone = "neutral",
  dot = false,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 text-xs font-medium ${t.box}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden="true" />}
      {children}
    </span>
  );
}

export function actionTone(action: "BUY" | "SELL" | "HOLD"): BadgeTone {
  return action === "BUY" ? "positive" : action === "SELL" ? "negative" : "neutral";
}
