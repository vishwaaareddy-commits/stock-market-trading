import { Inbox, type LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";

export type Illustration = "chart" | "wallet" | "users" | "signals" | "orders";

/** Decorative line-art for empty states. Pure SVG, uses the brand gradient, themes automatically. */
function Art({ kind }: { kind: Illustration }) {
  const id = useId().replace(/:/g, "");
  const g = `g${id}`;
  return (
    <svg viewBox="0 0 160 110" width="160" height="110" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="96" rx="56" ry="7" fill="var(--accent)" opacity="0.08" />
      {kind === "chart" && (
        <>
          <rect x="18" y="14" width="124" height="74" rx="12" fill="var(--elevated)" stroke="var(--line)" />
          <path d="M30 70 L52 52 L70 60 L96 34 L130 44" stroke={`url(#${g})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M30 70 L52 52 L70 60 L96 34 L130 44 V80 H30Z" fill={`url(#${g})`} opacity="0.12" />
          <circle cx="96" cy="34" r="4" fill={`url(#${g})`} />
        </>
      )}
      {kind === "wallet" && (
        <>
          <rect x="22" y="24" width="116" height="64" rx="14" fill="var(--elevated)" stroke="var(--line)" />
          <path d="M22 44h116" stroke="var(--line)" />
          <rect x="100" y="54" width="38" height="22" rx="8" fill={`url(#${g})`} opacity="0.9" />
          <circle cx="112" cy="65" r="3.5" fill="var(--surface)" />
          <path d="M36 36h30" stroke={`url(#${g})`} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {kind === "users" && (
        <>
          <circle cx="62" cy="42" r="15" fill="var(--elevated)" stroke="var(--line)" />
          <path d="M34 90c2-17 13-26 28-26s26 9 28 26" fill="var(--elevated)" stroke="var(--line)" />
          <circle cx="106" cy="48" r="12" fill={`url(#${g})`} opacity="0.85" />
          <path d="M86 90c1-14 9-21 20-21s19 7 20 21" fill={`url(#${g})`} opacity="0.45" />
        </>
      )}
      {kind === "signals" && (
        <>
          <path d="M24 70h20l10-34 16 52 14-42 10 24h42" stroke={`url(#${g})`} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="18" y="18" width="124" height="76" rx="14" stroke="var(--line)" />
        </>
      )}
      {kind === "orders" && (
        <>
          <rect x="30" y="14" width="100" height="78" rx="12" fill="var(--elevated)" stroke="var(--line)" />
          <path d="M44 36h44M44 52h72M44 68h56" stroke="var(--line)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="116" cy="36" r="6" fill={`url(#${g})`} />
        </>
      )}
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  illustration,
  action,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  illustration?: Illustration;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-elevated/30 px-6 py-10 text-center">
      {illustration ? (
        <Art kind={illustration} />
      ) : (
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent/15 to-accent-2/15 text-accent">
          <Icon size={22} aria-hidden="true" />
        </span>
      )}
      <p className="mt-3 font-display text-[15px] font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
