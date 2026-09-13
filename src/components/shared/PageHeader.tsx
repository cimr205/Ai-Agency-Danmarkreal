import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Canonical page header — formalizes the pattern that had already emerged
// independently across AutopilotPage/ConnectedAppsPage/WorkflowStudioPage/
// IntelligencePage (mono uppercase eyebrow + font-display title + optional
// stat cluster), rather than the hand-rolled `text-2xl font-bold
// text-foreground` header duplicated near-verbatim across Deals/Customers/
// Tasks/Calendar, or Dashboard's hardcoded-blue hero (which doesn't use the
// theme's actual ink/vermillion + crimson "Crater" brand tokens and has no
// dark-mode variant at all).

export interface PageHeaderStat {
  value: ReactNode;
  label: string;
  tone?: "default" | "warning" | "destructive";
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  stats,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  stats?: PageHeaderStat[];
  className?: string;
}) {
  return (
    <header className={cn("space-y-4", className)}>
      <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/50">
        {eyebrow}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          {description && (
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-6">
          {stats && stats.length > 0 && (
            <div className="flex items-center gap-6 text-xs">
              {stats.map((stat, i) => (
                <PageHeaderStatItem key={i} {...stat} />
              ))}
            </div>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
    </header>
  );
}

function PageHeaderStatItem({ value, label, tone = "default" }: PageHeaderStat) {
  return (
    <div className="space-y-0.5">
      <div
        className={cn(
          "text-xl font-semibold tabular-nums tracking-tight",
          tone === "warning" && "text-warning",
          tone === "destructive" && "text-destructive",
        )}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">{label}</div>
    </div>
  );
}
