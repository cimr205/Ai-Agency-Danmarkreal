/**
 * Stalled-deal detector + daily sales brief (read-only, propose-only).
 *
 * Operates on `deals` rows already in the system (never invents deals or numbers).
 * A deal is "stalled" when it is in a non-terminal stage and has not changed
 * (`updated_at`) for more than `maxIdleDays`. The daily brief is a plain aggregate
 * of real rows. Nudges are proposed as `tasks.create` DRAFTs through the
 * propose-only bridge — nothing is written or sent here.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

export interface Deal {
  id: string;
  title?: string;
  stage: string;
  value: number;
  currency?: string;
  updated_at: string; // ISO timestamp
  expected_close_date?: string | null;
}

export interface StalledOptions {
  /** Days without an update before a non-terminal deal counts as stalled. Default 14. */
  maxIdleDays?: number;
  /** Stages treated as closed/terminal (lower-cased compare). Default won/lost/closed. */
  terminalStages?: string[];
  /** "Now" for deterministic tests. Default Date.now(). */
  now?: number;
}

const DAY_MS = 86_400_000;

function isTerminal(stage: string, terminal: string[]): boolean {
  const s = stage.toLowerCase();
  return terminal.some((t) => s.includes(t));
}

export function idleDays(deal: Deal, now: number): number {
  return Math.floor((now - Date.parse(deal.updated_at)) / DAY_MS);
}

/** Non-terminal deals idle longer than the threshold, most-stale first. */
export function stalledDeals(deals: Deal[], opts: StalledOptions = {}): Deal[] {
  const maxIdleDays = opts.maxIdleDays ?? 14;
  const terminal = (opts.terminalStages ?? ["won", "lost", "closed"]).map((s) => s.toLowerCase());
  const now = opts.now ?? Date.now();
  return deals
    .filter((d) => !isTerminal(d.stage, terminal) && idleDays(d, now) > maxIdleDays)
    .sort((a, b) => idleDays(b, now) - idleDays(a, now));
}

export interface SalesBrief {
  generatedForDealCount: number;
  openDealCount: number;
  openPipelineValue: number;
  stalledCount: number;
  valueByStage: Record<string, number>;
  stalled: Array<{ id: string; title?: string; idleDays: number; value: number }>;
}

/** A read-only daily brief grounded only in the provided rows. No fabricated metrics. */
export function dailyBrief(deals: Deal[], opts: StalledOptions = {}): SalesBrief {
  const terminal = (opts.terminalStages ?? ["won", "lost", "closed"]).map((s) => s.toLowerCase());
  const now = opts.now ?? Date.now();
  const open = deals.filter((d) => !isTerminal(d.stage, terminal));
  const valueByStage: Record<string, number> = {};
  for (const d of open) valueByStage[d.stage] = (valueByStage[d.stage] ?? 0) + d.value;
  const stalled = stalledDeals(deals, opts);
  return {
    generatedForDealCount: deals.length,
    openDealCount: open.length,
    openPipelineValue: open.reduce((a, d) => a + d.value, 0),
    stalledCount: stalled.length,
    valueByStage,
    stalled: stalled.map((d) => ({ id: d.id, title: d.title, idleDays: idleDays(d, now), value: d.value })),
  };
}

type Proposer = ReturnType<typeof createActionProposer>;

/** Propose a follow-up `tasks.create` DRAFT for each stalled deal (idempotency keyed per deal). */
export async function proposeStalledNudges(proposer: Proposer, deals: Deal[], opts: StalledOptions = {}) {
  const now = opts.now ?? Date.now();
  const results = [];
  for (const d of stalledDeals(deals, opts)) {
    const days = idleDays(d, now);
    results.push(
      await proposer.propose({
        actionName: "tasks.create",
        input: {
          title: `Re-engage stalled deal: ${d.title ?? d.id} (${days}d idle)`,
          description: `Deal in stage "${d.stage}" worth ${d.value} ${d.currency ?? ""} has had no update for ${days} days. Review and decide next step. (Proposed by the CRM agent; approve to create the task.)`,
          deal_id: d.id,
        },
        reason: `Deal idle ${days} days (> threshold)`,
        idempotencyKey: `crm-stalled-${d.id}`,
      }),
    );
  }
  return results;
}
