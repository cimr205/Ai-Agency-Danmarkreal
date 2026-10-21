/**
 * Pipeline-update suggester (read-only, propose-only).
 *
 * Uses the tenant's REAL stage order (`pipeline_stages.name` by `order_index`) and
 * deal signals (completed deal-linked tasks, `expected_close_date`, stage age) to
 * suggest, with an explainable rationale:
 *  - "advance" → propose `crm.deal.move_stage` to the NEXT real stage, when enough
 *    linked work is done. Never invents a stage; if the current stage is unknown or
 *    final, no advance is suggested.
 *  - "review_stale" → a `tasks.create` review DRAFT when a deal is past its expected
 *    close date and still open (direction is a human decision, so no stage move).
 *
 * Never auto-moves a deal. `crm.deal.move_stage` is manager-gated and high-risk in
 * the registry; this only ever proposes a DRAFT for human approval.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";
import type { Deal } from "./stalled-deals.ts";

export interface PipelineOptions {
  /** Completed deal-linked tasks required before suggesting an advance. Default 1. */
  minCompletedToAdvance?: number;
  now?: number;
}

/** The next stage name after `current` in the tenant's ordered stages, or null. */
export function nextStage(current: string, orderedStages: string[]): string | null {
  const i = orderedStages.findIndex((s) => s.toLowerCase() === current.toLowerCase());
  if (i < 0 || i >= orderedStages.length - 1) return null;
  return orderedStages[i + 1];
}

export type SuggestionAction = "advance" | "review_stale";

export interface PipelineSuggestion {
  dealId: string;
  action: SuggestionAction;
  fromStage: string;
  toStage?: string; // only for "advance"
  rationale: string;
}

export function suggestPipelineUpdates(
  deals: Deal[],
  orderedStages: string[],
  completedTasksByDeal: Record<string, number> = {},
  opts: PipelineOptions = {},
): PipelineSuggestion[] {
  const minDone = opts.minCompletedToAdvance ?? 1;
  const now = opts.now ?? Date.now();
  const suggestions: PipelineSuggestion[] = [];

  for (const d of deals) {
    const next = nextStage(d.stage, orderedStages);
    const done = completedTasksByDeal[d.id] ?? 0;
    const pastClose = d.expected_close_date != null && Date.parse(d.expected_close_date) < now;

    if (next && done >= minDone) {
      suggestions.push({
        dealId: d.id,
        action: "advance",
        fromStage: d.stage,
        toStage: next,
        rationale: `${done} completed task(s) on this deal; ready to advance from "${d.stage}" to "${next}".`,
      });
    } else if (pastClose && next) {
      // Still open (a next stage exists) and overdue to close — needs a human review, not a move.
      suggestions.push({
        dealId: d.id,
        action: "review_stale",
        fromStage: d.stage,
        rationale: `Past expected close date and still in "${d.stage}". Review whether to advance, re-date or close.`,
      });
    }
  }
  return suggestions;
}

type Proposer = ReturnType<typeof createActionProposer>;

/** Advance → crm.deal.move_stage DRAFT; review_stale → tasks.create DRAFT. Never auto-executes. */
export async function proposePipelineUpdates(
  proposer: Proposer,
  deals: Deal[],
  orderedStages: string[],
  completedTasksByDeal: Record<string, number> = {},
  opts: PipelineOptions = {},
) {
  const results = [];
  for (const s of suggestPipelineUpdates(deals, orderedStages, completedTasksByDeal, opts)) {
    if (s.action === "advance") {
      results.push(
        await proposer.propose({
          actionName: "crm.deal.move_stage",
          input: { deal_id: s.dealId, stage: s.toStage },
          reason: s.rationale,
          idempotencyKey: `crm-pipeline-advance-${s.dealId}-${s.toStage}`,
        }),
      );
    } else {
      results.push(
        await proposer.propose({
          actionName: "tasks.create",
          input: {
            title: `Review stalled deal stage: ${s.dealId}`,
            description: `${s.rationale} (Proposed by the CRM agent; approve to create the review task. No stage is changed automatically.)`,
            deal_id: s.dealId,
          },
          reason: s.rationale,
          idempotencyKey: `crm-pipeline-review-${s.dealId}`,
        }),
      );
    }
  }
  return results;
}
