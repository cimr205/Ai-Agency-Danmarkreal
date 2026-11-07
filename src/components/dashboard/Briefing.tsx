import type { FocusItem } from "@/hooks/api/useDashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

function focusLabel(kind: FocusItem["kind"], t: (key: string) => string): string {
  const keys: Record<FocusItem["kind"], string> = {
    invoice: "briefing.labelInvoice",
    deal: "briefing.labelDeal",
    lead: "briefing.labelLead",
    followup: "briefing.labelFollowup",
  };
  return t(keys[kind]);
}

function focusCta(kind: FocusItem["kind"], t: (key: string) => string): string {
  const keys: Record<FocusItem["kind"], string> = {
    invoice: "briefing.ctaInvoice",
    deal: "briefing.ctaDeal",
    lead: "briefing.ctaLead",
    followup: "briefing.ctaFollowup",
  };
  return t(keys[kind]);
}

function focusItemText(item: FocusItem, t: (key: string) => string): string {
  const dayWord = t(item.days === 1 ? "briefing.dayWordSingular" : "briefing.dayWordPlural");
  if (item.kind === "invoice") {
    const key = item.company ? "briefing.invoiceOverdueWithCompany" : "briefing.invoiceOverdueNoCompany";
    return t(key).replace("{label}", item.label).replace("{days}", String(item.days)).replace("{dayWord}", dayWord).replace("{company}", item.company ?? "");
  }
  if (item.kind === "deal") {
    return t("briefing.dealStuck").replace("{label}", item.label).replace("{stage}", item.stage).replace("{days}", String(item.days)).replace("{dayWord}", dayWord);
  }
  if (item.kind === "followup") {
    const who = item.company ? ` — ${item.company}` : "";
    return item.overdue
      ? t("briefing.followupOverdue").replace("{days}", String(item.days)).replace("{dayWord}", dayWord).replace("{who}", who).replace("{label}", item.label)
      : t("briefing.followupToday").replace("{who}", who).replace("{label}", item.label);
  }
  const who = item.company ? t("briefing.leadAtCompany").replace("{label}", item.label).replace("{company}", item.company) : item.label;
  return item.overdue
    ? t("briefing.leadOverdue").replace("{who}", who)
    : t("briefing.leadNoContact").replace("{who}", who).replace("{days}", String(item.days));
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
  const { t } = useI18n();
  return (
    <section aria-labelledby="briefing-heading">
      <div className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/70">
          {t('briefing.eyebrow')}
        </p>
        <h2 id="briefing-heading" className="mt-1 font-serif text-[24px] italic leading-tight text-foreground sm:text-[28px]">
          {t('briefing.heading')}
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
          <p className="text-[15px] text-foreground">{t('briefing.allCaughtUp')}</p>
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
                    <p className="text-[14px] leading-snug text-foreground">{focusItemText(item, t)}</p>
                    <p className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground/60">
                      {focusLabel(item.kind, t)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => onNavigate(href)}
                  className="shrink-0 self-start pl-8 text-[12.5px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:self-center sm:pl-0"
                >
                  {focusCta(item.kind, t)} →
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
