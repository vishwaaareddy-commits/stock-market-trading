"use client";

import { useEffect, useId, useRef, useState } from "react";

export type ChartPoint = { time: string; value: number };

type LineChartProps = {
  points: ChartPoint[];
  /** Formats axis labels and the tooltip value. */
  format: (value: number) => string;
  height?: number;
  tone?: "accent" | "positive" | "negative";
  /** Accessible summary, e.g. "Virtual cash balance over time". */
  label: string;
};

const PAD = { top: 14, right: 16, bottom: 28, left: 64 };
const TONE_VAR = { accent: "var(--accent)", positive: "var(--positive)", negative: "var(--negative)" } as const;

function niceRange(min: number, max: number): [number, number] {
  if (min === max) {
    const d = Math.abs(min) * 0.05 || 1;
    return [min - d, max + d];
  }
  const pad = (max - min) * 0.1;
  return [min - pad, max + pad];
}

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const fullLabel = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Dependency-free area/line chart for REAL series. Gridlines, axes and tooltip use theme tokens, so it
 * restyles itself with the light/dark switch. Needs at least two points; callers show an empty state otherwise.
 */
export function LineChart({ points, format, height = 280, tone = "accent", label }: LineChartProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const color = TONE_VAR[tone];
  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const values = points.map((p) => p.value);
  const [lo, hi] = niceRange(Math.min(...values), Math.max(...values));
  const times = points.map((p) => Date.parse(p.time));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const timed = Number.isFinite(t0) && t1 > t0; // real time axis when timestamps differ
  const frac = (i: number) => (timed ? (times[i] - t0) / (t1 - t0) : points.length === 1 ? 0.5 : i / (points.length - 1));
  const x = (i: number) => PAD.left + frac(i) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${PAD.top + innerH} L${x(0).toFixed(1)} ${PAD.top + innerH} Z`;
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
  // axis labels at 0%, 50% and 100% of the time span
  const xLabels = timed
    ? [0, 0.5, 1].map((f) => ({ f, text: dateLabel(new Date(t0 + (t1 - t0) * f).toISOString()) }))
    : [0, points.length - 1].map((i) => ({ f: i === 0 ? 0 : 1, text: dateLabel(points[i].time) }));

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  }

  const hp = hover === null ? null : points[hover];
  return (
    <div ref={wrap} className="relative w-full min-w-0 overflow-hidden">
      <svg
        role="img"
        aria-label={`${label}. From ${format(points[0].value)} to ${format(points[points.length - 1].value)}.`}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="block max-w-full touch-none select-none"
      >
        <defs>
          <linearGradient id={`fill-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.32" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeDasharray="3 5" />
            <text x={PAD.left - 10} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--chart-axis)">
              {format(t)}
            </text>
          </g>
        ))}
        {xLabels.map(({ f, text }) => (
          <text
            key={f}
            x={PAD.left + f * innerW}
            y={height - 8}
            textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
            fontSize="11"
            fill="var(--chart-axis)"
          >
            {text}
          </text>
        ))}
        <path d={area} fill={`url(#fill-${uid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        {hp && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke={color} strokeOpacity="0.45" />
            <circle cx={x(hover)} cy={y(hp.value)} r="5" fill="var(--surface)" stroke={color} strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {hp && hover !== null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 rounded-lg border px-2.5 py-1.5 text-xs shadow-pop"
          style={{
            left: Math.min(Math.max(x(hover) - 70, 4), width - 150),
            top: Math.max(y(hp.value) - 54, 0),
            background: "var(--chart-tooltip-bg)",
            borderColor: "var(--chart-tooltip-border)",
          }}
        >
          <div className="font-display text-sm font-semibold text-foreground">{format(hp.value)}</div>
          <div className="text-muted">{fullLabel(hp.time)}</div>
        </div>
      )}
    </div>
  );
}
