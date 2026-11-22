/** Every wallet balance and paper trade is labelled so it can never be mistaken for real money. */
export function VirtualBadge({ label = "VIRTUAL · PAPER" }: { label?: string }) {
  return (
    <span
      title="Simulated funds. Not real money; no bank or broker is involved."
      className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full border border-accent/40 bg-accent/10 px-2 text-[10px] font-semibold tracking-wider text-accent"
    >
      {label}
    </span>
  );
}
