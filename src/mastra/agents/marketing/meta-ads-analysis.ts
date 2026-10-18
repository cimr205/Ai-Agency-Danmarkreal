/**
 * Meta Ads read-only analysis + budget-suggestion drafter (propose-only).
 *
 * Aggregates real `meta_daily_insights` rows (spend, clicks, impressions,
 * conversions) per campaign and derives standard metrics. Budget suggestions are
 * deterministic rules surfaced as `tasks.create` DRAFTs for human review — they
 * NEVER change spend automatically. Paid publishing/budget changes always require
 * explicit human approval (there is no auto-spend path here). No fabricated metrics:
 * everything is computed from the supplied rows; zero-conversion spend is flagged,
 * not hidden.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

export interface DailyInsight {
  campaign_id: string | null;
  insight_date: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

export interface CampaignSummary {
  campaignId: string;
  spend: number;
  clicks: number;
  impressions: number;
  conversions: number;
  ctr: number; // clicks / impressions
  cpc: number; // spend / clicks
  cpa: number | null; // spend / conversions (null when no conversions)
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Aggregate insights per campaign and derive metrics from real totals only. */
export function summarizeByCampaign(insights: DailyInsight[]): CampaignSummary[] {
  const acc = new Map<string, { spend: number; clicks: number; impressions: number; conversions: number }>();
  for (const i of insights) {
    if (!i.campaign_id) continue;
    const a = acc.get(i.campaign_id) ?? { spend: 0, clicks: 0, impressions: 0, conversions: 0 };
    a.spend += i.spend;
    a.clicks += i.clicks;
    a.impressions += i.impressions;
    a.conversions += i.conversions;
    acc.set(i.campaign_id, a);
  }
  return [...acc.entries()].map(([campaignId, a]) => ({
    campaignId,
    spend: round(a.spend),
    clicks: a.clicks,
    impressions: a.impressions,
    conversions: a.conversions,
    ctr: a.impressions ? round(a.clicks / a.impressions, 4) : 0,
    cpc: a.clicks ? round(a.spend / a.clicks) : 0,
    cpa: a.conversions ? round(a.spend / a.conversions) : null,
  }));
}

export interface BudgetOptions {
  /** Target cost per acquisition. Suggestions compare CPA against this. Default 300. */
  targetCpa?: number;
  /** Spend above which a zero-conversion campaign is flagged to pause. Default 500. */
  wasteSpendThreshold?: number;
}

export type BudgetAction = "increase" | "decrease" | "pause" | "hold";

export interface BudgetSuggestion {
  campaignId: string;
  action: BudgetAction;
  rationale: string;
  metrics: Pick<CampaignSummary, "spend" | "conversions" | "cpa">;
}

/** Deterministic, explainable budget suggestions. Never applied automatically. */
export function budgetSuggestions(summaries: CampaignSummary[], opts: BudgetOptions = {}): BudgetSuggestion[] {
  const targetCpa = opts.targetCpa ?? 300;
  const waste = opts.wasteSpendThreshold ?? 500;
  return summaries.map((s) => {
    let action: BudgetAction = "hold";
    let rationale: string;
    if (s.conversions === 0 && s.spend >= waste) {
      action = "pause";
      rationale = `Spend ${s.spend} with 0 conversions (≥ waste threshold ${waste}).`;
    } else if (s.cpa != null && s.cpa <= targetCpa * 0.75) {
      action = "increase";
      rationale = `CPA ${s.cpa} well below target ${targetCpa} — efficient; consider scaling.`;
    } else if (s.cpa != null && s.cpa >= targetCpa * 1.5) {
      action = "decrease";
      rationale = `CPA ${s.cpa} well above target ${targetCpa} — reduce until efficiency improves.`;
    } else {
      rationale = s.cpa != null ? `CPA ${s.cpa} within range of target ${targetCpa}.` : "Not enough conversion data.";
    }
    return { campaignId: s.campaignId, action, rationale, metrics: { spend: s.spend, conversions: s.conversions, cpa: s.cpa } };
  });
}

type Proposer = ReturnType<typeof createActionProposer>;

/**
 * Propose a `tasks.create` review DRAFT for each non-"hold" budget suggestion.
 * Never changes spend; a human approves the task, and any actual budget change is
 * a separate, explicitly-approved step.
 */
export async function proposeBudgetReviews(proposer: Proposer, insights: DailyInsight[], opts: BudgetOptions = {}) {
  const suggestions = budgetSuggestions(summarizeByCampaign(insights), opts).filter((s) => s.action !== "hold");
  const results = [];
  for (const s of suggestions) {
    results.push(
      await proposer.propose({
        actionName: "tasks.create",
        input: {
          title: `Meta Ads budget review: ${s.action} campaign ${s.campaignId}`,
          description: `Suggested action: ${s.action}. ${s.rationale} Metrics — spend ${s.metrics.spend}, conversions ${s.metrics.conversions}, CPA ${s.metrics.cpa ?? "n/a"}. (Proposed by the Marketing agent for review; NO budget is changed automatically — approve and apply manually.)`,
        },
        reason: `Budget suggestion: ${s.action}`,
        idempotencyKey: `mkt-budget-${s.campaignId}`,
      }),
    );
  }
  return results;
}
