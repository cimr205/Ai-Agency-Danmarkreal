import { describe, it, expect, vi } from "vitest";
import {
  nextStage,
  suggestPipelineUpdates,
  proposePipelineUpdates,
} from "@/mastra/agents/crm/pipeline-suggester";
import type { Deal } from "@/mastra/agents/crm/stalled-deals";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const STAGES = ["Lead", "Qualified", "Proposal", "Negotiation", "Won"];
const NOW = Date.parse("2026-10-18T12:00:00Z");
const d = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

const deals: Deal[] = [
  { id: "a", stage: "Qualified", value: 1, updated_at: d(-10), expected_close_date: d(30) }, // has work -> advance
  { id: "b", stage: "Proposal", value: 1, updated_at: d(-40), expected_close_date: d(-5) }, // overdue, no work -> review
  { id: "c", stage: "Won", value: 1, updated_at: d(-1) }, // final -> nothing
  { id: "e", stage: "Lead", value: 1, updated_at: d(-2) }, // no work, not overdue -> nothing
];
const completed = { a: 2, b: 0 };

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("nextStage", () => {
  it("returns the next real stage, null for final/unknown", () => {
    expect(nextStage("Qualified", STAGES)).toBe("Proposal");
    expect(nextStage("Won", STAGES)).toBeNull();
    expect(nextStage("Unknown", STAGES)).toBeNull();
  });
});

describe("suggestPipelineUpdates", () => {
  it("advances deals with completed work; flags overdue-open as review; ignores final/idle", () => {
    const s = suggestPipelineUpdates(deals, STAGES, completed, { now: NOW });
    expect(s).toHaveLength(2);
    expect(s.find((x) => x.dealId === "a")).toMatchObject({ action: "advance", toStage: "Proposal" });
    expect(s.find((x) => x.dealId === "b")).toMatchObject({ action: "review_stale" });
    expect(s.some((x) => x.dealId === "c" || x.dealId === "e")).toBe(false);
  });
});

describe("proposePipelineUpdates", () => {
  it("advance -> crm.deal.move_stage DRAFT; review -> tasks.create; never auto-executes", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    await proposePipelineUpdates(proposer, deals, STAGES, completed, { now: NOW });

    const advance = seen.find((p) => p.actionName === "crm.deal.move_stage")!;
    expect(advance.input).toMatchObject({ deal_id: "a", stage: "Proposal" });
    expect(advance.requestedApproval).toBe("awaiting_approval"); // high-risk, never auto
    expect(seen.find((p) => p.actionName === "tasks.create")!.idempotencyKey).toBe("crm-pipeline-review-b");
  });

  it("AUTO still never auto-approves the high-risk stage move", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "AUTO");
    await proposePipelineUpdates(proposer, deals, STAGES, completed, { now: NOW });
    const advance = seen.find((p) => p.actionName === "crm.deal.move_stage")!;
    expect(advance.requestedApproval).toBe("awaiting_approval");
  });
});
