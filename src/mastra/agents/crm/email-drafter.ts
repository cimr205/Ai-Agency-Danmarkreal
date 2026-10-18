/**
 * Personalized email DRAFT proposer (propose-only, draft-only).
 *
 * Builds a personalized email draft from REAL lead/customer fields only (never
 * invents facts). The draft is surfaced as a `tasks.create` proposal that HOLDS
 * the email body — it is explicitly NOT `email.send`. Sending always requires a
 * separate human approval and a lawful basis; there is no cold-email path here.
 *
 * Compliance guards:
 *  - A draft is only produced when there is a prior relationship signal
 *    (`hasLegalBasis` / existing customer / inbound lead). Otherwise the request
 *    is refused with a reason — no cold outreach is drafted.
 *  - Personalization tokens come from supplied fields; missing fields are omitted,
 *    never guessed.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

export interface Recipient {
  id: string;
  name?: string;
  email?: string;
  company_name?: string;
  /** e.g. "inbound_lead" | "existing_customer" | "event_signup" — a lawful basis to contact. */
  relationship?: string;
  /** Explicit owner/compliance flag that there is a lawful basis to email this recipient. */
  hasLegalBasis?: boolean;
}

export interface EmailDraft {
  recipientId: string;
  subject: string;
  body: string;
}

export class NoLegalBasisError extends Error {}

const LAWFUL_RELATIONSHIPS = new Set(["inbound_lead", "existing_customer", "event_signup", "opted_in"]);

/** True when we may draft outreach: explicit flag OR a recognised prior relationship. */
export function hasLawfulBasis(r: Recipient): boolean {
  return Boolean(r.hasLegalBasis) || (r.relationship != null && LAWFUL_RELATIONSHIPS.has(r.relationship));
}

/**
 * Build a personalized draft from real fields only. Throws NoLegalBasisError when
 * there is no lawful basis to contact the recipient (no cold email).
 */
export function draftEmail(r: Recipient, topic: string): EmailDraft {
  if (!hasLawfulBasis(r)) {
    throw new NoLegalBasisError(`No lawful basis to email ${r.id}; refusing to draft cold outreach.`);
  }
  const greetingName = r.name?.split(/\s+/)[0];
  const greeting = greetingName ? `Hej ${greetingName},` : "Hej,";
  const companyRef = r.company_name ? ` hos ${r.company_name}` : "";
  const subject = `${topic}${r.company_name ? ` — ${r.company_name}` : ""}`;
  const body =
    `${greeting}\n\n` +
    `Jeg vender tilbage angående ${topic}${companyRef}. ` +
    `Sig til, hvis det har interesse, så finder vi et tidspunkt.\n\n` +
    `Venlig hilsen`;
  return { recipientId: r.id, subject, body };
}

type Proposer = ReturnType<typeof createActionProposer>;

/**
 * Propose the draft as a `tasks.create` (holding the body for human review) — NOT email.send.
 * Returns { skipped } entries for recipients without a lawful basis (never drafted/sent).
 */
export async function proposeEmailDrafts(proposer: Proposer, recipients: Recipient[], topic: string) {
  const out: Array<{ recipientId: string; status: "proposed" | "skipped"; reason?: string }> = [];
  for (const r of recipients) {
    if (!hasLawfulBasis(r)) {
      out.push({ recipientId: r.id, status: "skipped", reason: "no lawful basis — no cold email" });
      continue;
    }
    const draft = draftEmail(r, topic);
    await proposer.propose({
      actionName: "tasks.create",
      input: {
        title: `Review email draft to ${r.name ?? r.id}: ${draft.subject}`,
        description:
          `Proposed email DRAFT (not sent). Subject: ${draft.subject}\n\n${draft.body}\n\n` +
          `(Proposed by the CRM agent. Approving creates a review task; sending is a separate, human-approved step with a lawful basis.)`,
        lead_id: r.id,
      },
      reason: `Personalized draft for ${r.relationship ?? "known contact"}`,
      idempotencyKey: `crm-emaildraft-${r.id}`,
    });
    out.push({ recipientId: r.id, status: "proposed" });
  }
  return out;
}
