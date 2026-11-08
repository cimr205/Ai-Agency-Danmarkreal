import { useCurrency } from "@/contexts/CurrencyContext";
import type { Tables } from "@/integrations/supabase/types";
import { dateLocaleTag, tx } from '@/lib/inlineI18n';

const STATUS_TONE: Record<string, string> = {
  paid: "text-emerald-500/90",
  draft: "text-muted-foreground/60",
  sent: "text-foreground/70",
  overdue: "text-destructive",
  accepted: "text-emerald-500/90",
  rejected: "text-destructive",
  expired: "text-muted-foreground/60",
};

export function ClientLedger({ invoices, payments, quotes }: { invoices: Tables<"invoices">[]; payments: Tables<"payments">[]; quotes: Tables<"quotes">[] }) {
  const { format } = useCurrency();
  if (invoices.length === 0 && payments.length === 0 && quotes.length === 0) {
    return <div className="text-[12.5px] text-muted-foreground/70">{tx("Ingen økonomiske bevægelser.", "No financial activity.")}</div>;
  }

  type Row = { id: string; date: string; label: string; tone?: string; amount: number; sign: 1 | -1 };
  const rows: Row[] = [];
  for (const q of quotes) {
    rows.push({
      id: `q-${q.id}`,
      date: q.accepted_at || q.sent_at || q.created_at,
      label: `${tx("Tilbud", "Quote")}: ${q.title}`,
      tone: STATUS_TONE[q.status] || STATUS_TONE.draft,
      amount: Number(q.total), sign: 1,
    });
  }
  for (const i of invoices) {
    const overdue = i.status !== "paid" && i.due_date && new Date(i.due_date) < new Date();
    rows.push({
      id: `i-${i.id}`,
      date: i.issued_at || i.created_at,
      label: `${tx("Faktura", "Invoice")} #${i.invoice_number}`,
      tone: STATUS_TONE[overdue ? "overdue" : i.status],
      amount: Number(i.amount), sign: 1,
    });
  }
  for (const p of payments) {
    if (!p.paid_at) continue;
    rows.push({
      id: `p-${p.id}`, date: p.paid_at, label: tx("Betaling", "Payment"),
      tone: STATUS_TONE.paid, amount: Number(p.amount), sign: -1,
    });
  }
  rows.sort((a, b) => +new Date(b.date) - +new Date(a.date));

  return (
    <ul className="divide-y divide-border/40">
      {rows.map(r => (
        <li key={r.id} className="py-3 flex items-baseline gap-4">
          <span className="text-[10.5px] font-mono text-muted-foreground/60 w-20 shrink-0">
            {new Date(r.date).toLocaleDateString(dateLocaleTag(), { day: "2-digit", month: "short" })}
          </span>
          <span className="flex-1 text-[13px] text-foreground/90 truncate">{r.label}</span>
          <span className={`font-mono text-[12.5px] tabular-nums ${r.tone || "text-foreground/80"}`}>
            {r.sign === -1 ? "− " : ""}{format(r.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}
