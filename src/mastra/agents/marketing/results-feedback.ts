/**
 * results → leads → CRM feedback (read-only analysis, propose-only hand-off).
 *
 * Attributes real `meta_leadgen_events` back to campaigns, computes cost-per-lead
 * (using spend from the Meta Ads analysis), and hands net-new, lawfully-sourced
 * leads to CRM as `crm.lead.create` DRAFTs. The actual contact fields live in the
 * event's `raw` payload (Meta lead-form field_data); they are parsed defensively
 * and NEVER fabricated — an event without a real email is skipped. No metrics are
 * invented; cost-per-lead is null when spend is unknown.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

export interface LeadgenEvent {
  id: string;
  meta_campaign_id: string | null;
  status?: string;
  customer_id?: string | null;
  received_at?: string;
  raw: unknown; // Meta webhook payload; shape handled defensively below
}

export interface Contact {
  name?: string;
  email?: string;
  phone?: string;
}

/** Defensively extract a contact from a Meta lead-form payload. Returns only fields actually present. */
export function extractContact(raw: unknown): Contact {
  const c: Contact = {};
  if (!raw || typeof raw !== "object") return c;
  const r = raw as Record<string, unknown>;

  // Meta shape: { field_data: [{ name: "email", values: ["x@y.z"] }, ...] }
  const fd = r.field_data;
  if (Array.isArray(fd)) {
    for (const f of fd) {
      if (!f || typeof f !== "object") continue;
      const name = String((f as Record<string, unknown>).name ?? "").toLowerCase();
      const values = (f as Record<string, unknown>).values;
      const value = Array.isArray(values) && values.length ? String(values[0]) : undefined;
      if (!value) continue;
      if (name.includes("email")) c.email = value;
      else if (name.includes("phone")) c.phone = value;
      else if (name.includes("name")) c.name = c.name ?? value;
    }
  }
  // Flat fallbacks, only if not already found.
  c.email = c.email ?? (typeof r.email === "string" ? r.email : undefined);
  c.name = c.name ?? (typeof r.full_name === "string" ? r.full_name : typeof r.name === "string" ? r.name : undefined);
  c.phone = c.phone ?? (typeof r.phone === "string" ? r.phone : undefined);
  return c;
}

export interface CampaignLeadStats {
  campaignId: string;
  leadCount: number;
  spend: number | null;
  costPerLead: number | null;
}

/** Leads per campaign + cost-per-lead from real events and (optional) spend. */
export function costPerLead(events: LeadgenEvent[], spendByCampaign: Record<string, number> = {}): CampaignLeadStats[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (!e.meta_campaign_id) continue;
    counts.set(e.meta_campaign_id, (counts.get(e.meta_campaign_id) ?? 0) + 1);
  }
  return [...counts.entries()].map(([campaignId, leadCount]) => {
    const spend = campaignId in spendByCampaign ? spendByCampaign[campaignId] : null;
    return {
      campaignId,
      leadCount,
      spend,
      costPerLead: spend != null && leadCount > 0 ? Math.round((spend / leadCount) * 100) / 100 : null,
    };
  });
}

type Proposer = ReturnType<typeof createActionProposer>;

export interface FeedbackOutcome {
  eventId: string;
  status: "proposed" | "skipped_no_email" | "skipped_duplicate" | "skipped_already_linked";
}

/**
 * Propose crm.lead.create DRAFTs for unlinked events that have a real email and are
 * not already a lead (dedupe by email). Records the campaign as the source. No fabrication.
 */
export async function proposeLeadsFromEvents(
  proposer: Proposer,
  events: LeadgenEvent[],
  existingLeadEmails: string[],
): Promise<FeedbackOutcome[]> {
  const known = new Set(existingLeadEmails.map((e) => e.trim().toLowerCase()));
  const seen = new Set<string>();
  const outcomes: FeedbackOutcome[] = [];

  for (const e of events) {
    if (e.customer_id) {
      outcomes.push({ eventId: e.id, status: "skipped_already_linked" });
      continue;
    }
    const contact = extractContact(e.raw);
    if (!contact.email) {
      outcomes.push({ eventId: e.id, status: "skipped_no_email" });
      continue;
    }
    const key = contact.email.trim().toLowerCase();
    if (known.has(key) || seen.has(key)) {
      outcomes.push({ eventId: e.id, status: "skipped_duplicate" });
      continue;
    }
    seen.add(key);
    await proposer.propose({
      actionName: "crm.lead.create",
      input: { name: contact.name ?? contact.email, email: contact.email, phone: contact.phone },
      reason: `Meta lead-ad result (campaign ${e.meta_campaign_id ?? "unknown"})`,
      idempotencyKey: `mkt-leadgen-${e.id}`,
    });
    outcomes.push({ eventId: e.id, status: "proposed" });
  }
  return outcomes;
}
