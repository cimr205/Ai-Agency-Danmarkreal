/**
 * Calling PREP (read-only, propose-only) — prepares a call list WITHOUT making calls.
 *
 * Builds a prioritized, consent-checked call list from leads that have a phone number
 * AND an explicit call consent, and proposes `tasks.create` "call back" reminders for
 * a human to action. It NEVER dials, never integrates telephony, and never fabricates
 * a phone number or consent. Leads without consent or without a phone are excluded and
 * reported — not called.
 *
 * The actual calling integration (Power Dialer / voice-agent) is a separate, owner-
 * authorized step and is intentionally NOT invoked here (no unauthorized calls).
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

export interface CallableLead {
  id: string;
  name?: string;
  phone?: string | null;
  /** Explicit, recorded consent to be called (owner/compliance flag). Never assumed. */
  callConsent?: boolean;
  /** Optional ICP score to prioritize the list (from icp-score). */
  score?: number;
}

export interface CallListEntry {
  leadId: string;
  name?: string;
  phone: string;
  score: number;
}

export interface CallPrepResult {
  callList: CallListEntry[];
  excluded: Array<{ leadId: string; reason: "no_consent" | "no_phone" }>;
}

/** Build the call list: consent AND a phone required; sorted by score desc. Nothing is dialed. */
export function prepareCallList(leads: CallableLead[]): CallPrepResult {
  const callList: CallListEntry[] = [];
  const excluded: CallPrepResult["excluded"] = [];
  for (const l of leads) {
    if (!l.callConsent) {
      excluded.push({ leadId: l.id, reason: "no_consent" });
      continue;
    }
    if (!l.phone) {
      excluded.push({ leadId: l.id, reason: "no_phone" });
      continue;
    }
    callList.push({ leadId: l.id, name: l.name, phone: l.phone, score: l.score ?? 0 });
  }
  callList.sort((a, b) => b.score - a.score);
  return { callList, excluded };
}

type Proposer = ReturnType<typeof createActionProposer>;

/**
 * Propose a `tasks.create` "call back" reminder per callable lead. No call is placed.
 * Excluded leads (no consent / no phone) are returned, never proposed, never dialed.
 */
export async function proposeCallReminders(proposer: Proposer, leads: CallableLead[]) {
  const { callList, excluded } = prepareCallList(leads);
  const proposed: string[] = [];
  for (const c of callList) {
    await proposer.propose({
      actionName: "tasks.create",
      input: {
        title: `Call back ${c.name ?? c.leadId}${c.score ? ` (ICP ${c.score})` : ""}`,
        description:
          `Consented call-back reminder for ${c.name ?? c.leadId} (${c.phone}). ` +
          `(Proposed by the CRM agent; approve to create the task. No call is placed automatically — ` +
          `dialing is a separate, owner-authorized step.)`,
        lead_id: c.leadId,
      },
      reason: "Consented lead ready for a call-back",
      idempotencyKey: `crm-callback-${c.leadId}`,
    });
    proposed.push(c.leadId);
  }
  return { proposed, excluded };
}
