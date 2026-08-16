import { Mail, FileText, CreditCard, Calendar, Briefcase, Activity } from "lucide-react";
import type { TimelineEvent } from "@/hooks/useClientGraph";
import { useCurrency } from "@/contexts/CurrencyContext";

const ICONS = {
  email: Mail, invoice: FileText, payment: CreditCard,
  meeting: Calendar, deal: Briefcase, activity: Activity,
} as const;

function groupKey(d: Date): string {
  const today = new Date(); today.setHours(0,0,0,0);
  const dt = new Date(d); dt.setHours(0,0,0,0);
  const diff = Math.floor((+today - +dt) / 86400000);
  if (diff === 0) return "I dag";
  if (diff === 1) return "I går";
  if (diff < 7) return d.toLocaleDateString("da-DK", { weekday: "long" });
  if (diff < 30) return `For ${diff} dage siden`;
  return d.toLocaleDateString("da-DK", { month: "long", year: "numeric" });
}

export function ClientTimeline({ events }: { events: TimelineEvent[] }) {
  const { format } = useCurrency();
  if (events.length === 0) {
    return (
      <div className="text-[13px] text-muted-foreground py-12 text-center border border-dashed border-border/50 rounded-md">
        Ingen aktivitet registreret endnu.
      </div>
    );
  }

  // Group by day-bucket
  const groups: Record<string, TimelineEvent[]> = {};
  for (const e of events) {
    const k = groupKey(new Date(e.at));
    (groups[k] ||= []).push(e);
  }

  return (
    <div className="space-y-7">
      {Object.entries(groups).map(([label, items]) => (
        <div key={label}>
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground/60 mb-3 capitalize">
            {label}
          </div>
          <ul className="space-y-2.5">
            {items.map(e => {
              const Icon = ICONS[e.kind];
              return (
                <li key={e.id} className="group flex items-start gap-3 py-1">
                  <div className="mt-0.5 h-6 w-6 grid place-items-center rounded-md bg-foreground/[0.04] border border-border/40 text-muted-foreground group-hover:text-foreground transition-colors">
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-[13px] text-foreground/90 truncate">{e.title}</span>
                      {e.amount != null && (
                        <span className="text-[12px] font-mono text-foreground/70">{format(e.amount)}</span>
                      )}
                    </div>
                    {e.meta && (
                      <div className="text-[11.5px] text-muted-foreground/70 truncate">{e.meta}</div>
                    )}
                  </div>
                  <div className="text-[10.5px] font-mono text-muted-foreground/50 pt-1 shrink-0">
                    {new Date(e.at).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
