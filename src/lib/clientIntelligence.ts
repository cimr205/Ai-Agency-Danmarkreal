// Heuristic-based "AI" intelligence layer for the Connected Business Graph.
// No external calls — pure derivations from the data we already have.
import type { TimelineEvent } from "@/hooks/useClientGraph";
import type { Tables } from "@/integrations/supabase/types";

export type Signal = {
  id: string;
  kind: "risk" | "opportunity" | "suggestion" | "info";
  title: string;
  detail?: string;
};

const dayMs = 86_400_000;

export function deriveClientSignals(input: {
  customer: Tables<'customers'>;
  deals: Tables<'deals'>[];
  invoices: Tables<'invoices'>[];
  payments: Tables<'payments'>[];
  emails: unknown[];
  meetings: unknown[];
  timeline: TimelineEvent[];
  stats: { pipelineValue: number; invoicedThisYear: number; overdueInvoices: number; lastTouch?: string; openDeals: number };
}): Signal[] {
  const { deals, invoices, timeline, stats, customer } = input;
  const out: Signal[] = [];
  const now = Date.now();

  // Last touch risk
  const lastTouchAt = stats.lastTouch ? new Date(stats.lastTouch).getTime() : 0;
  const daysSinceTouch = lastTouchAt ? Math.floor((now - lastTouchAt) / dayMs) : 999;
  if (lastTouchAt && daysSinceTouch >= 12) {
    out.push({
      id: "stale-touch",
      kind: "risk",
      title: `Ingen kontakt i ${daysSinceTouch} dage`,
      detail: "Send en kort opfølgning for at holde relationen varm.",
    });
  } else if (lastTouchAt && daysSinceTouch <= 2) {
    out.push({
      id: "fresh-touch",
      kind: "info",
      title: "Aktiv samtale",
      detail: "I har talt sammen for nylig — momentum er højt.",
    });
  }

  // Overdue invoices risk
  if (stats.overdueInvoices > 0) {
    out.push({
      id: "overdue",
      kind: "risk",
      title: `${stats.overdueInvoices} forfalden faktura${stats.overdueInvoices > 1 ? "er" : ""}`,
      detail: "Send venlig påmindelse eller ring direkte.",
    });
  }

  // Stalled deals
  const stalled = deals.filter(d => {
    if (["won", "lost"].includes(d.stage)) return false;
    const updated = new Date(d.updated_at || d.created_at).getTime();
    return (now - updated) / dayMs > 21;
  });
  if (stalled.length > 0) {
    out.push({
      id: "stalled-deals",
      kind: "risk",
      title: `${stalled.length} deal${stalled.length > 1 ? "s" : ""} står stille`,
      detail: "Ingen bevægelse i 3+ uger. Bekræft næste skridt.",
    });
  }

  // Upsell opportunity
  if (stats.invoicedThisYear > 0 && stats.openDeals === 0) {
    out.push({
      id: "upsell",
      kind: "opportunity",
      title: "Mulig mersalg",
      detail: "Eksisterende kunde uden åben pipeline — foreslå næste leverance.",
    });
  }

  // High value pipeline
  if (stats.pipelineValue > 100_000) {
    out.push({
      id: "high-value",
      kind: "opportunity",
      title: "Højværdi pipeline",
      detail: "Prioritér denne klient i ugens fokus.",
    });
  }

  // Suggestion: meeting
  const lastMeeting = timeline.find(e => e.kind === "meeting");
  if (!lastMeeting || (Date.now() - new Date(lastMeeting.at).getTime()) / dayMs > 60) {
    out.push({
      id: "meeting-suggest",
      kind: "suggestion",
      title: "Foreslå et møde",
      detail: "I har ikke mødtes længe — book 30 min.",
    });
  }

  return out.slice(0, 5);
}

export function relationshipTemperature(daysSinceTouch: number): {
  label: string; tone: "hot" | "warm" | "cool" | "cold";
} {
  if (daysSinceTouch <= 3) return { label: "Aktiv", tone: "hot" };
  if (daysSinceTouch <= 10) return { label: "Varm", tone: "warm" };
  if (daysSinceTouch <= 30) return { label: "Køler af", tone: "cool" };
  return { label: "Inaktiv", tone: "cold" };
}

export function buildAiSummary(input: {
  customer: Tables<'customers'>;
  stats: { pipelineValue: number; invoicedThisYear: number; overdueInvoices: number; openDeals: number; lastTouch?: string };
  signals: Signal[];
}): string {
  const { customer, stats, signals } = input;
  const parts: string[] = [];

  if (stats.openDeals > 0) {
    parts.push(`${stats.openDeals} åben${stats.openDeals > 1 ? "e" : ""} deal${stats.openDeals > 1 ? "s" : ""}`);
  }
  if (stats.invoicedThisYear > 0) {
    parts.push(`faktureret i år`);
  }
  if (stats.overdueInvoices > 0) {
    parts.push(`med ${stats.overdueInvoices} forfalden faktura`);
  }

  const risk = signals.find(s => s.kind === "risk");
  const opp = signals.find(s => s.kind === "opportunity");

  let sentence = `${customer.name} er en ${parts.length ? "aktiv" : "rolig"} relation${parts.length ? " — " + parts.join(", ") : ""}.`;
  if (risk) sentence += ` Vær opmærksom: ${risk.title.toLowerCase()}.`;
  else if (opp) sentence += ` Mulighed: ${opp.title.toLowerCase()}.`;
  return sentence;
}
