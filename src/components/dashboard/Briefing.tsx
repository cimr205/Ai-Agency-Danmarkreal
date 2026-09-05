import type { FocusItem } from "@/hooks/api/useDashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const FOCUS_CTA: Record<FocusItem["kind"], string> = {
  invoice: "Send rykker",
  deal: "Følg op",
  lead: "Ring",
  followup: "Åbn",
};

const FOCUS_LABEL: Record<FocusItem["kind"], string> = {
  invoice: "Faktura",
  deal: "Deal",
  lead: "Lead",
  followup: "Opfølgning",
};

function focusItemText(item: FocusItem): string {
  if (item.kind === "invoice") {
    return `Faktura #${item.label} er ${item.days} dag${item.days === 1 ? "" : "e"} forfalden${item.company ? ` — ${item.company}` : ""}`;
  }
  if (item.kind === "deal") {
    return `Deal "${item.label}" har stået i ${item.stage} i ${item.days} dag${item.days === 1 ? "" : "e"}`;
  }
  if (item.kind === "followup") {
    const who = item.company ? ` — ${item.company}` : "";
    return item.overdue
      ? `Opfølgning overskredet med ${item.days} dag${item.days === 1 ? "" : "e"}${who}: ${item.label}`
      : `Opfølgning i dag${who}: ${item.label}`;
  }
  const who = item.company ? `${item.label} hos ${item.company}` : item.label;
  return item.overdue ? `${who} — opfølgning er overskredet` : `${who} — ${item.days} dage uden kontakt`;
}

function focusItemHref(item: FocusItem, base: string): string {
  if (item.kind === "invoice") return `${base}/finance/invoices`;
  if (item.kind === "deal") return `${base}/crm/deals?view=board`;
  if (item.kind === "followup") return `${base}/clients/${item.id}`;
  return `${base}/crm/leads`;
}

export function Briefing({
  items,
  isLoading,
  base,
  emptyContext,
  onNavigate,
}: {
  items: FocusItem[];
  isLoading: boolean;
  base: string;
  emptyContext: string;
  onNavigate: (href: string) => void;
}) {
  return (
    <section aria-labelledby="briefing-heading">
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
          Dagens briefing
        </p>
        <h2 id="briefing-heading" className="mt-1 font-serif text-[24px] italic leading-tight text-foreground sm:text-[28px]">
          Det ville jeg tage først
        </h2>
      </div>

      {isLoading ? (
        <ul>
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-start gap-3 border-b border-border/60 py-4 last:border-0">
              <Skeleton className="h-3 w-5 shrink-0 rounded-[3px]" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-[80%]" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-20 shrink-0" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="py-2">
          <p className="text-[15px] text-foreground">Alt vigtigt er fulgt op.</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{emptyContext}</p>
        </div>
      ) : (
        <ul>
          {items.map((item, i) => {
            const urgent = item.overdue || item.kind === "invoice";
            const href = focusItemHref(item, base);
            return (
              <li
                key={`${item.kind}-${item.id}`}
                className="flex flex-col gap-1.5 border-b border-border/60 py-4 last:border-0 sm:flex-row sm:items-start sm:gap-4"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 shrink-0 font-mono text-[11px] tabular-nums",
                      // dark theme's --primary is already crimson (same family as
                      // --stamp), so urgency and "this is a link" collapse into the
                      // same color there — fall back to the semantic warning amber
                      // in dark mode to keep the two signals visually distinct.
                      urgent ? "text-stamp dark:text-warning" : "text-muted-foreground/50",
                    )}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[14px] leading-snug text-foreground">{focusItemText(item)}</p>
                    <p className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground/60">
                      {FOCUS_LABEL[item.kind]}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onNavigate(href)}
                  className="shrink-0 self-start pl-8 text-[12.5px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:self-center sm:pl-0"
                >
                  {FOCUS_CTA[item.kind]} →
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
