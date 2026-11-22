import { CircleAlert, CircleCheck, Info } from "lucide-react";
import type { ReactNode } from "react";

const STYLES = {
  error: { box: "border-negative/30 bg-negative/[0.07]", icon: CircleAlert, color: "text-negative", role: "alert" },
  success: { box: "border-positive/30 bg-positive/[0.07]", icon: CircleCheck, color: "text-positive", role: "status" },
  info: { box: "border-accent/30 bg-accent/[0.06]", icon: Info, color: "text-accent", role: "status" },
} as const;

export function Notice({ tone = "info", children }: { tone?: keyof typeof STYLES; children: ReactNode }) {
  const s = STYLES[tone];
  const Icon = s.icon;
  return (
    <div role={s.role} className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm text-foreground ${s.box}`}>
      <Icon size={16} aria-hidden="true" className={`mt-0.5 shrink-0 ${s.color}`} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
