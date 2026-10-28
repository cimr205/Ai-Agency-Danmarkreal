import { useCurrency } from "@/contexts/CurrencyContext";
import { Sparkles } from "lucide-react";
import { tx } from '@/lib/inlineI18n';

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
    ? tx("Følg op på forfalden faktura", "Follow up on overdue invoice")
    : pipelineValue > 0
    ? tx("Bekræft næste skridt på åben deal", "Confirm the next step on the open deal")
    : tx("Send en hilsen — det er stille", "Send a hello — it has been quiet");

  return (
    <aside className="border border-border/60 rounded-lg p-5 bg-foreground/[0.015] divide-y divide-border/40">
      <Stat label={tx("Værdi i pipeline", "Pipeline value")} value={format(pipelineValue)} />
      <Stat label={tx("Faktureret i år", "Invoiced this year")} value={format(invoicedThisYear)} />
      <Stat label={tx("Forfaldne fakturaer", "Overdue invoices")} value={String(overdueInvoices)} tone={overdueInvoices > 0 ? "danger" : undefined} />
      <div className="pt-4">
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground/60 mb-2">{tx("Næste handling", "Next action")}</div>
        <div className="text-[13px] text-foreground/90 leading-snug">{suggestion || fallbackSuggestion}</div>
        <div className="mt-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] font-mono text-muted-foreground/60">
          <Sparkles className="h-2.5 w-2.5" /> {tx("foreslået af AI", "suggested by AI")}
        </div>
      </div>
    </aside>
  );
}
