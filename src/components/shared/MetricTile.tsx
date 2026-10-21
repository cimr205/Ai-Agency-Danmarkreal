import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type Tone = "primary" | "success" | "warning" | "destructive";

const TONE_GRADIENT: Record<Tone, string> = {
  primary: "bg-[image:var(--gradient-primary)]",
  success: "bg-gradient-to-br from-success to-success/70",
  warning: "bg-gradient-to-br from-warning to-warning/70",
  destructive: "bg-gradient-to-br from-destructive to-destructive/70",
};

const TONE_STROKE: Record<Tone, string> = {
  primary: "hsl(var(--primary))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  destructive: "hsl(var(--destructive))",
};

/** Tiny inline trend line — hand-rolled SVG rather than pulling the chart
 * library in per-tile; a KPI sparkline is a handful of points, not worth
 * recharts' render cost four times on one dashboard. */
function Sparkline({ data, tone }: { data: number[]; tone: Tone }) {
  if (data.length < 2) return null;
  const w = 64;
  const h = 22;
  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden="true">
      <polyline points={points} fill="none" stroke={TONE_STROKE[tone]} strokeOpacity={0.75} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Compact metric tile: icon badge + value + label, optionally linking
 * somewhere. Uses the theme's own gradient tokens (--gradient-primary etc,
 * already defined in index.css but unused before this) so it reads
 * correctly in both the light "ink & vermillion" and dark "Crater" themes,
 * instead of a hardcoded palette unrelated to the brand.
 */
export function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
  href,
  tone = "primary",
  sparkline,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  href?: string;
  tone?: Tone;
  /** Oldest → newest values for a trend line. Omit rather than pass fake/synthetic data. */
  sparkline?: number[];
  className?: string;
}) {
  const content = (
    <div
      className={cn(
        "group rounded-xl border border-border bg-card p-4 transition-colors",
        href && "hover:border-foreground/20",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
        <span className={cn("grid h-8 w-8 place-items-center rounded-lg text-primary-foreground", TONE_GRADIENT[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-foreground">{value}</div>
      <div className="mt-1 flex items-end justify-between gap-2">
        {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : <span />}
        {sparkline && sparkline.length >= 2 && <Sparkline data={sparkline} tone={tone} />}
      </div>
    </div>
  );

  if (!href) return content;
  return (
    <Link to={href} className="block">
      {content}
    </Link>
  );
}
