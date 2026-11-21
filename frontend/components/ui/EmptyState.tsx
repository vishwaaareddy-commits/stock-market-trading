export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</p>
    </div>
  );
}
