import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

const BORDER_BY_INDEX = [
  "",
  "border-l",
  "border-t sm:border-t-0 sm:border-l",
  "border-l border-t sm:border-t-0",
];

export interface Metric {
  label: string;
  value: string | null;
  sub?: string;
  delta?: number | null;
  destructive?: boolean;
  href: string;
  sparkline?: { v: number }[];
}

export function MetricsRow({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-2 border-y border-border sm:grid-cols-4">
      {metrics.map((m, i) => (
        <Link
          key={m.label}
          to={m.href}
          className={cn("group border-border px-5 py-5 transition-colors hover:bg-muted/40 sm:px-7", BORDER_BY_INDEX[i])}
        >
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
            {m.label}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            {m.value === null ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <span
                className={cn(
                  "font-display text-[26px] font-semibold tabular-nums tracking-tight sm:text-[29px]",
                  m.destructive && "text-destructive",
                )}
              >
                {m.value}
              </span>
            )}
            {typeof m.delta === "number" && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-[11px] font-medium",
                  m.delta >= 0 ? "text-success" : "text-destructive",
                )}
              >
                {m.delta >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {Math.abs(m.delta)}%
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3">
            {m.sub && <p className="text-[11.5px] text-muted-foreground">{m.sub}</p>}
            {m.sparkline && m.sparkline.some((p) => p.v > 0) && (
              <div className="h-5 w-12 shrink-0 opacity-70">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={m.sparkline}>
                    <defs>
                      <linearGradient id={`spark-${m.label}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="v"
                      stroke="hsl(var(--primary))"
                      strokeWidth={1.25}
                      fill={`url(#spark-${m.label})`}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
