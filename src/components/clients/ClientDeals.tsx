import { useCurrency } from "@/contexts/CurrencyContext";
import type { Tables } from "@/integrations/supabase/types";

const STAGE_LABELS: Record<string, string> = {
  discovery: "Discovery", qualification: "Kvalificering", proposal: "Tilbud",
  negotiation: "Forhandling", won: "Vundet", lost: "Tabt",
};

export function ClientDeals({ deals }: { deals: Tables<"deals">[] }) {
  const { format } = useCurrency();
  if (deals.length === 0) {
    return <div className="text-[12.5px] text-muted-foreground/70">Ingen deals endnu.</div>;
  }
  return (
    <ul className="divide-y divide-border/40">
      {deals.map(d => (
        <li key={d.id} className="py-3 flex items-baseline gap-4">
          <span className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground/60 w-24 shrink-0">
            {STAGE_LABELS[d.stage] || d.stage}
          </span>
          <span className="flex-1 text-[13px] text-foreground/90 truncate">{d.title}</span>
          <span className="font-mono text-[12.5px] tabular-nums text-foreground/80">{format(Number(d.value || 0))}</span>
        </li>
      ))}
    </ul>
  );
}
