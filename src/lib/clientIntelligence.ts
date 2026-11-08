// Heuristic-based "AI" intelligence layer for the Connected Business Graph.
// No external calls — pure derivations from the data we already have.
import type { TimelineEvent } from "@/hooks/useClientGraph";
import type { Tables } from "@/integrations/supabase/types";
import { tx } from '@/lib/inlineI18n';
import { getLocaleFromPath } from '@/lib/i18n';

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
      title: tx(`Ingen kontakt i ${daysSinceTouch} dage`, `No contact for ${daysSinceTouch} days`),
      detail: tx("Send en kort opfølgning for at holde relationen varm.", "Send a short follow-up to keep the relationship warm."),
    });
  } else if (lastTouchAt && daysSinceTouch <= 2) {
    out.push({
      id: "fresh-touch",
      kind: "info",
      title: tx("Aktiv samtale", "Active conversation"),
      detail: tx("I har talt sammen for nylig — momentum er højt.", "You spoke recently — momentum is high."),
    });
  }

  // Overdue invoices risk
  if (stats.overdueInvoices > 0) {
    out.push({
      id: "overdue",
      kind: "risk",
      title: tx(`${stats.overdueInvoices} forfalden faktura${stats.overdueInvoices > 1 ? "er" : ""}`, `${stats.overdueInvoices} overdue invoice${stats.overdueInvoices > 1 ? "s" : ""}`),
      detail: tx("Send venlig påmindelse eller ring direkte.", "Send a friendly reminder or call directly."),
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
      title: tx(`${stalled.length} deal${stalled.length > 1 ? "s" : ""} står stille`, `${stalled.length} deal${stalled.length > 1 ? "s" : ""} stalled`),
      detail: tx("Ingen bevægelse i 3+ uger. Bekræft næste skridt.", "No movement for 3+ weeks. Confirm the next step."),
    });
  }

  // Upsell opportunity
  if (stats.invoicedThisYear > 0 && stats.openDeals === 0) {
    out.push({
      id: "upsell",
      kind: "opportunity",
      title: tx("Mulig mersalg", "Possible upsell"),
      detail: tx("Eksisterende kunde uden åben pipeline — foreslå næste leverance.", "Existing customer with no open pipeline — propose the next delivery."),
    });
  }

  // High value pipeline
  if (stats.pipelineValue > 100_000) {
    out.push({
      id: "high-value",
      kind: "opportunity",
      title: tx("Højværdi pipeline", "High-value pipeline"),
      detail: tx("Prioritér denne klient i ugens fokus.", "Prioritise this client in this week's focus."),
    });
  }

  // Suggestion: meeting
  const lastMeeting = timeline.find(e => e.kind === "meeting");
  // "I har ikke mødtes længe" only makes sense for a client we've had for a
  // while — it was shown for clients created the same day.
  const clientAgeDays = (now - new Date(customer.created_at).getTime()) / dayMs;
  if (clientAgeDays > 30 && (!lastMeeting || (Date.now() - new Date(lastMeeting.at).getTime()) / dayMs > 60)) {
    out.push({
      id: "meeting-suggest",
      kind: "suggestion",
      title: tx("Foreslå et møde", "Suggest a meeting"),
      detail: tx("I har ikke mødtes længe — book 30 min.", "You haven't met in a while — book 30 min."),
    });
  }

  return out.slice(0, 5);
}

export function relationshipTemperature(daysSinceTouch: number): {
  label: string; tone: "hot" | "warm" | "cool" | "cold";
} {
  if (daysSinceTouch <= 3) return { label: tx("Aktiv", "Active"), tone: "hot" };
  if (daysSinceTouch <= 10) return { label: tx("Varm", "Warm"), tone: "warm" };
  if (daysSinceTouch <= 30) return { label: tx("Køler af", "Cooling"), tone: "cool" };
  return { label: tx("Inaktiv", "Inactive"), tone: "cold" };
}

export function buildAiSummary(input: {
  customer: Tables<'customers'>;
  stats: { pipelineValue: number; invoicedThisYear: number; overdueInvoices: number; openDeals: number; lastTouch?: string };
  signals: Signal[];
}): string {
  const { customer, stats, signals } = input;
  const loc = getLocaleFromPath();
  const parts: string[] = [];
  const n = stats.openDeals, o = stats.overdueInvoices;
  if (loc === "da") {
    if (n > 0) parts.push(`${n} åben${n > 1 ? "e" : ""} deal${n > 1 ? "s" : ""}`);
    if (stats.invoicedThisYear > 0) parts.push(`faktureret i år`);
    if (o > 0) parts.push(`med ${o} ${o > 1 ? "forfaldne fakturaer" : "forfalden faktura"}`);
  } else if (loc === "de") {
    if (n > 0) parts.push(`${n} offene${n > 1 ? "" : "r"} Deal${n > 1 ? "s" : ""}`);
    if (stats.invoicedThisYear > 0) parts.push(`dieses Jahr fakturiert`);
    if (o > 0) parts.push(`mit ${o} überfällige${o > 1 ? "n Rechnungen" : "r Rechnung"}`);
  } else {
    if (n > 0) parts.push(`${n} open deal${n > 1 ? "s" : ""}`);
    if (stats.invoicedThisYear > 0) parts.push(`invoiced this year`);
    if (o > 0) parts.push(`with ${o} overdue invoice${o > 1 ? "s" : ""}`);
  }

  const risk = signals.find(s => s.kind === "risk");
  const opp = signals.find(s => s.kind === "opportunity");
  const tail = parts.length ? " — " + parts.join(", ") : "";

  let sentence = loc === "da"
    ? `${customer.name} er en ${parts.length ? "aktiv" : "rolig"} relation${tail}.`
    : loc === "de"
      ? `${customer.name} ist eine ${parts.length ? "aktive" : "ruhige"} Beziehung${tail}.`
      : `${customer.name} is ${parts.length ? "an active" : "a quiet"} relationship${tail}.`;
  if (risk) sentence += ` ${tx("Vær opmærksom", "Watch out")}: ${risk.title.toLowerCase()}.`;
  else if (opp) sentence += ` ${tx("Mulighed", "Opportunity")}: ${opp.title.toLowerCase()}.`;
  return sentence;
}
