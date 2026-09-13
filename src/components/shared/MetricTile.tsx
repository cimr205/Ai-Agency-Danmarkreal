import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "destructive";

const TONE_GRADIENT: Record<Tone, string> = {
  primary: "bg-[image:var(--gradient-primary)]",
  success: "bg-gradient-to-br from-success to-success/70",
  warning: "bg-gradient-to-br from-warning to-warning/70",
  destructive: "bg-gradient-to-br from-destructive to-destructive/70",
};

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
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  href?: string;
  tone?: Tone;
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
      {detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}
    </div>
  );

  if (!href) return content;
  return (
    <Link to={href} className="block">
      {content}
    </Link>
  );
}
