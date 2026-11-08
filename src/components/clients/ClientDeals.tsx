import { useCurrency } from "@/contexts/CurrencyContext";
import type { Tables } from "@/integrations/supabase/types";
import { tx } from '@/lib/inlineI18n';

const STAGE_LABELS: Record<string, string> = {
  get discovery() { return "Discovery"; }, get qualification() { return tx("Kvalificering", "Qualification"); }, get proposal() { return tx("Tilbud", "Proposal"); },
  get negotiation() { return tx("Forhandling", "Negotiation"); }, get won() { return tx("Vundet", "Won"); }, get lost() { return tx("Tabt", "Lost"); },
};

export function ClientDeals({ deals }: { deals: Tables<"deals">[] }) {
  const { format } = useCurrency();
  if (deals.length === 0) {
    return <div className="text-[12.5px] text-muted-foreground/70">{tx("Ingen deals endnu.", "No deals yet.")}</div>;
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
