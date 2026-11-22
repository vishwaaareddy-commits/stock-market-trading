import type { ReactNode } from "react";

type SectionCardProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Remove body padding (for full-bleed tables). */
  flush?: boolean;
  className?: string;
};

export function SectionCard({
  title,
  description,
  action,
  children,
  flush = false,
  className = "",
}: SectionCardProps) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-2xl border border-line bg-surface shadow-card ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="font-display text-[15px] font-semibold tracking-tight text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}
