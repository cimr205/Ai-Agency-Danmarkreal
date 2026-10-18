/**
 * CRM lead prioritization + follow-up proposer (propose-only).
 *
 * This does NOT score leads. The explainable 0–100 ICP score already exists
 * server-side in `supabase/functions/icp-score` (7 weighted components:
 * industry/location/company-size/role/pain-points/service-fit/budget-fit, with
 * match_reasons + red_flags, persisted to `lead_icp_scores`). That edge function
 * is the single source of truth; re-implementing the math would create a parallel
 * execution path, which is forbidden.
 *
 * Here we only: (1) rank already-scored leads, (2) for those at/above a threshold,
 * build a human-readable follow-up task that carries the explainable reasons, and
 * (3) submit it as a DRAFT proposal through the propose-only Action Registry bridge
 * (`createActionProposer`). No DB client, no scoring, no sends.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

/** A lead already scored by the icp-score edge function (shape of `lead_icp_scores` rows we rely on). */
export interface ScoredLead {
  lead_id: string;
  name?: string;
  score: number; // 0–100, produced by icp-score (never recomputed here)
  match_reasons?: string[];
  red_flags?: string[];
}

export interface PrioritizerOptions {
  /** Minimum ICP score to warrant a follow-up proposal. Default 70. */
  threshold?: number;
  /** Cap how many follow-ups to propose per run (highest scores first). Default 10. */
  maxProposals?: number;
}

type Proposer = ReturnType<typeof createActionProposer>;

/** Ordered view: leads at/above threshold, highest score first, capped. */
export function prioritize(leads: ScoredLead[], opts: PrioritizerOptions = {}): ScoredLead[] {
  const threshold = opts.threshold ?? 70;
  const maxProposals = opts.maxProposals ?? 10;
  return leads
    .filter((l) => typeof l.score === "number" && l.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxProposals);
}

/** Build the explainable follow-up task input for a single scored lead. */
export function followUpTaskInput(lead: ScoredLead): Record<string, unknown> {
  const reasons = (lead.match_reasons ?? []).join("; ");
  const flags = (lead.red_flags ?? []).join("; ");
  const who = lead.name ? `${lead.name} (${lead.lead_id})` : lead.lead_id;
  const title = `Follow up with high-ICP lead ${who} — score ${lead.score}`;
  const description =
    `ICP score ${lead.score}/100.` +
    (reasons ? ` Why: ${reasons}.` : "") +
    (flags ? ` Watch-outs: ${flags}.` : "") +
    ` Review and decide next step. (Proposed by the CRM agent; approve to create the task.)`;
  return { title, description, lead_id: lead.lead_id };
}

/**
 * Propose a `tasks.create` follow-up for each prioritized lead through the
 * propose-only bridge. Returns the submit results (null entries are OFF-mode leads).
 * Idempotency key is derived from the lead so re-runs dedupe server-side.
 */
export async function proposeFollowUps(
  proposer: Proposer,
  leads: ScoredLead[],
  opts: PrioritizerOptions = {},
) {
  const top = prioritize(leads, opts);
  const results = [];
  for (const lead of top) {
    results.push(
      await proposer.propose({
        actionName: "tasks.create",
        input: followUpTaskInput(lead),
        reason: `High ICP score (${lead.score}) — agent-suggested follow-up`,
        idempotencyKey: `crm-followup-${lead.lead_id}`,
      }),
    );
  }
  return results;
}
