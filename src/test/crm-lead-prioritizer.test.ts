import { describe, it, expect, vi } from "vitest";
import { prioritize, followUpTaskInput, proposeFollowUps, type ScoredLead } from "@/mastra/agents/crm/lead-prioritizer";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

/**
 * The prioritizer reuses the server-side ICP score (never recomputes it) and can
 * only PROPOSE follow-ups through the propose-only bridge. These tests pin the
 * ranking/threshold math and that nothing is created or sent directly.
 */

const leads: ScoredLead[] = [
  { lead_id: "a", name: "Acme", score: 92, match_reasons: ["Matches target industry: SaaS"] },
  { lead_id: "b", name: "Beta", score: 70 },
  { lead_id: "c", name: "Gamma", score: 69, red_flags: ["Company size unknown — needs enrichment"] },
  { lead_id: "d", name: "Delta", score: 81 },
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("prioritize", () => {
  it("keeps only leads at/above the threshold, highest score first", () => {
    const top = prioritize(leads, { threshold: 70 });
    expect(top.map((l) => l.lead_id)).toEqual(["a", "d", "b"]); // 69 (c) excluded; sorted 92,81,70
  });

  it("respects maxProposals", () => {
    expect(prioritize(leads, { threshold: 0, maxProposals: 2 }).map((l) => l.lead_id)).toEqual(["a", "d"]);
  });

  it("defaults to threshold 70", () => {
    expect(prioritize(leads).every((l) => l.score >= 70)).toBe(true);
  });
});

describe("followUpTaskInput", () => {
  it("carries the explainable score, reasons and red flags into the task", () => {
    const input = followUpTaskInput(leads[0]);
    expect(input.lead_id).toBe("a");
    expect(String(input.title)).toContain("score 92");
    expect(String(input.description)).toContain("Matches target industry: SaaS");
  });

  it("does not invent reasons when none are present", () => {
    const input = followUpTaskInput(leads[1]);
    expect(String(input.description)).toContain("ICP score 70/100.");
    expect(String(input.description)).not.toContain("Why:");
  });
});

describe("proposeFollowUps", () => {
  it("proposes a tasks.create DRAFT per prioritized lead, idempotency keyed by lead", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");

    const results = await proposeFollowUps(proposer, leads, { threshold: 80 });

    expect(seen.map((p) => p.actionName)).toEqual(["tasks.create", "tasks.create"]); // a(92), d(81)
    expect(seen.map((p) => p.idempotencyKey)).toEqual(["crm-followup-a", "crm-followup-d"]);
    expect(seen.every((p) => p.requestedApproval === "awaiting_approval")).toBe(true);
    expect(results).toHaveLength(2);
  });

  it("proposes nothing when every action is OFF (no create, no send)", async () => {
    const { submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "OFF");
    const results = await proposeFollowUps(proposer, leads, { threshold: 0 });
    expect(submit).not.toHaveBeenCalled();
    expect(results.every((r) => r === null)).toBe(true);
  });
});
