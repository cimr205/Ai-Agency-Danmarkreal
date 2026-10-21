import { describe, it, expect, vi } from "vitest";
import {
  summarizeByCampaign,
  budgetSuggestions,
  proposeBudgetReviews,
  type DailyInsight,
} from "@/mastra/agents/marketing/meta-ads-analysis";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const insights: DailyInsight[] = [
  // c1: efficient (CPA 100) → increase
  { campaign_id: "c1", insight_date: "2026-10-01", spend: 500, clicks: 100, impressions: 10000, conversions: 5 },
  // c2: wasteful (spend 600, 0 conversions) → pause
  { campaign_id: "c2", insight_date: "2026-10-01", spend: 600, clicks: 50, impressions: 8000, conversions: 0 },
  // c3: expensive (CPA 600 vs target 300) → decrease
  { campaign_id: "c3", insight_date: "2026-10-01", spend: 600, clicks: 40, impressions: 5000, conversions: 1 },
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("summarizeByCampaign", () => {
  it("derives metrics from real totals only", () => {
    const s = summarizeByCampaign(insights).find((x) => x.campaignId === "c1")!;
    expect(s.spend).toBe(500);
    expect(s.conversions).toBe(5);
    expect(s.cpa).toBe(100); // 500/5
    expect(s.ctr).toBe(0.01); // 100/10000
  });
  it("cpa is null when there are no conversions (never faked)", () => {
    expect(summarizeByCampaign(insights).find((x) => x.campaignId === "c2")!.cpa).toBeNull();
  });
});

describe("budgetSuggestions", () => {
  it("is deterministic and explainable", () => {
    const byId = Object.fromEntries(budgetSuggestions(summarizeByCampaign(insights)).map((s) => [s.campaignId, s.action]));
    expect(byId).toEqual({ c1: "increase", c2: "pause", c3: "decrease" });
  });
});

describe("proposeBudgetReviews", () => {
  it("proposes tasks.create review DRAFTs (never changes spend), one per non-hold suggestion", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const results = await proposeBudgetReviews(proposer, insights);
    expect(seen.every((p) => p.actionName === "tasks.create")).toBe(true);
    expect(seen.map((p) => p.idempotencyKey).sort()).toEqual(["mkt-budget-c1", "mkt-budget-c2", "mkt-budget-c3"]);
    expect(seen.every((p) => p.requestedApproval === "awaiting_approval")).toBe(true);
    expect(results).toHaveLength(3);
  });
});
