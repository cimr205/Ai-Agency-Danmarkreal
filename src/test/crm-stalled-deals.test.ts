import { describe, it, expect, vi } from "vitest";
import { stalledDeals, dailyBrief, proposeStalledNudges, idleDays, type Deal } from "@/mastra/agents/crm/stalled-deals";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const deals: Deal[] = [
  { id: "a", title: "Acme", stage: "proposal", value: 10000, currency: "DKK", updated_at: daysAgo(30) },
  { id: "b", title: "Beta", stage: "negotiation", value: 5000, currency: "DKK", updated_at: daysAgo(20) },
  { id: "c", title: "Gamma", stage: "proposal", value: 8000, currency: "DKK", updated_at: daysAgo(3) },
  { id: "d", title: "Delta", stage: "Won", value: 99999, currency: "DKK", updated_at: daysAgo(90) }, // terminal
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("stalledDeals", () => {
  it("flags only non-terminal deals idle beyond the threshold, most stale first", () => {
    const stalled = stalledDeals(deals, { maxIdleDays: 14, now: NOW });
    expect(stalled.map((d) => d.id)).toEqual(["a", "b"]); // c too fresh, d is Won
  });

  it("excludes won/lost/closed stages regardless of idle time", () => {
    expect(stalledDeals(deals, { maxIdleDays: 1, now: NOW }).some((d) => d.id === "d")).toBe(false);
  });

  it("idleDays is computed from updated_at", () => {
    expect(idleDays(deals[0], NOW)).toBe(30);
  });
});

describe("dailyBrief", () => {
  it("aggregates only real rows — no fabricated metrics", () => {
    const brief = dailyBrief(deals, { maxIdleDays: 14, now: NOW });
    expect(brief.generatedForDealCount).toBe(4);
    expect(brief.openDealCount).toBe(3); // a, b, c
    expect(brief.openPipelineValue).toBe(23000); // 10000+5000+8000
    expect(brief.stalledCount).toBe(2);
    expect(brief.valueByStage).toEqual({ proposal: 18000, negotiation: 5000 });
  });
});

describe("proposeStalledNudges", () => {
  it("proposes a tasks.create DRAFT per stalled deal, idempotency keyed per deal; nothing sent", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const results = await proposeStalledNudges(proposer, deals, { maxIdleDays: 14, now: NOW });
    expect(seen.map((p) => p.actionName)).toEqual(["tasks.create", "tasks.create"]);
    expect(seen.map((p) => p.idempotencyKey)).toEqual(["crm-stalled-a", "crm-stalled-b"]);
    expect(seen.every((p) => p.requestedApproval === "awaiting_approval")).toBe(true);
    expect(results).toHaveLength(2);
  });
});
