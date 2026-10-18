import { describe, it, expect, vi } from "vitest";
import {
  planSequence,
  proposeSequence,
  DEFAULT_CADENCE,
  NoLawfulBasisForSequenceError,
} from "@/mastra/agents/crm/followup-sequence";
import type { Recipient } from "@/mastra/agents/crm/email-drafter";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const START = Date.parse("2026-10-18T00:00:00Z");
const inbound: Recipient = { id: "l1", name: "Mette", company_name: "Acme ApS", relationship: "inbound_lead" };
const cold: Recipient = { id: "x1", name: "Ukendt" };

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("planSequence", () => {
  it("plans dated steps from the cadence (day 0/3/7)", () => {
    const steps = planSequence(inbound, START);
    expect(steps.map((s) => s.dayOffset)).toEqual([0, 3, 7]);
    expect(steps.map((s) => s.dueDate)).toEqual(["2026-10-18", "2026-10-21", "2026-10-25"]);
    expect(steps[0].body).toContain("Hej Mette,");
  });

  it("refuses to plan a cold sequence", () => {
    expect(() => planSequence(cold, START)).toThrow(NoLawfulBasisForSequenceError);
  });

  it("honours a custom cadence", () => {
    const steps = planSequence(inbound, START, [{ dayOffset: 1, topic: "x" }, { dayOffset: 14, topic: "y" }]);
    expect(steps.map((s) => s.dayOffset)).toEqual([1, 14]);
  });
});

describe("proposeSequence", () => {
  it("proposes one scheduled tasks.create DRAFT per step; never email.send", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const res = await proposeSequence(proposer, inbound, START);

    expect(res).toMatchObject({ status: "proposed", steps: 3 });
    expect(seen).toHaveLength(DEFAULT_CADENCE.length);
    expect(seen.every((p) => p.actionName === "tasks.create")).toBe(true);
    expect(seen.some((p) => p.actionName === "email.send")).toBe(false);
    expect(seen.map((p) => p.idempotencyKey)).toEqual(["crm-seq-l1-d0", "crm-seq-l1-d3", "crm-seq-l1-d7"]);
    expect(seen[1].input.due_date).toBe("2026-10-21");
  });

  it("skips a cold recipient and proposes nothing", async () => {
    const { submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const res = await proposeSequence(proposer, cold, START);
    expect(res.status).toBe("skipped");
    expect(submit).not.toHaveBeenCalled();
  });
});
