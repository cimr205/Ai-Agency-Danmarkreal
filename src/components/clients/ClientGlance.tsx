import { useCurrency } from "@/contexts/CurrencyContext";
import { Sparkles } from "lucide-react";

interface Props {
  pipelineValue: number;
  invoicedThisYear: number;
  overdueInvoices: number;
  suggestion?: string;
}

export function ClientGlance({ pipelineValue, invoicedThisYear, overdueInvoices, suggestion }: Props) {
  const { format } = useCurrency();

  const Stat = ({ label, value, tone }: { label: string; value: string; tone?: "danger" | "ok" }) => (
    <div className="py-3.5 first:pt-0 last:pb-0">
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground/60 mb-1.5">{label}</div>
      <div className={`font-display text-[22px] tabular-nums leading-none ${tone === "danger" ? "text-destructive" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );

  const fallbackSuggestion = overdueInvoices > 0
    ? "Følg op på forfalden faktura"
    : pipelineValue > 0
    ? "Bekræft næste skridt på åben deal"
    : "Send en hilsen — det er stille";

  return (
    <aside className="border border-border/60 rounded-lg p-5 bg-foreground/[0.015] divide-y divide-border/40">
      <Stat label="Værdi i pipeline" value={format(pipelineValue)} />
      <Stat label="Faktureret i år" value={format(invoicedThisYear)} />
      <Stat label="Forfaldne fakturaer" value={String(overdueInvoices)} tone={overdueInvoices > 0 ? "danger" : undefined} />
      <div className="pt-4">
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground/60 mb-2">Næste handling</div>
        <div className="text-[13px] text-foreground/90 leading-snug">{suggestion || fallbackSuggestion}</div>
        <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] font-mono text-muted-foreground/60">
          <Sparkles className="h-2.5 w-2.5" /> foreslået af AI
        </div>
      </div>
    </aside>
  );
}
