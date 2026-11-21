import type { ReactNode } from "react";

type CardProps = {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Card({ title, action, children, className = "" }: CardProps) {
  return (
    <section className={`rounded-lg border border-line bg-surface ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-foreground">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
