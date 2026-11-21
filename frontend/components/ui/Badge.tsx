import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "positive" | "negative" | "info";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-line bg-white/5 text-muted",
  positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  negative: "border-red-500/30 bg-red-500/10 text-red-400",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-400",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function actionTone(action: "BUY" | "SELL" | "HOLD"): BadgeTone {
  return action === "BUY" ? "positive" : action === "SELL" ? "negative" : "neutral";
}
