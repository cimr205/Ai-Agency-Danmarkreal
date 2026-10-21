/**
 * System verification (negative paths + cross-cutting safety), buildable without auth.
 *
 * Covers the "ALLE AGENTER" checks that do NOT require a live session:
 *  - no permission / no capability: unknown action rejected; OFF proposes nothing.
 *  - no false success: a failing transport propagates (never reported as success).
 *  - idempotency: the same input yields the same idempotency keys on re-run (replay dedupe).
 *  - empty-input safety: representative modules propose nothing on empty data.
 *
 * The live agent→approval→DB→UI chain and cross-tenant persistence remain BLOCKED
 * (need safe auth test accounts — HR_QA_DECISIONS QA-1); they are not simulated here,
 * so nothing is ever reported as a false PASS.
 */
import { describe, it, expect, vi } from "vitest";
import {
  createActionProposer,
  UnknownActionError,
  type ActionProposal,
  type SubmitResult,
} from "@/mastra/tools/action-proposal";
import { proposeFollowUps, type ScoredLead } from "@/mastra/agents/crm/lead-prioritizer";
import { overdueInvoices, proposeDunningDrafts, type Invoice } from "@/mastra/agents/finance/overdue-invoices";
import { staffingReport } from "@/mastra/agents/hr/staffing-gaps";

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("no permission / no capability", () => {
  it("rejects an unknown action rather than guessing", async () => {
    const { submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "AUTO");
    await expect(proposer.propose({ actionName: "db.truncate", input: {}, reason: "x" })).rejects.toBeInstanceOf(
      UnknownActionError,
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it("OFF proposes nothing", async () => {
    const { submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "OFF");
    expect(await proposer.propose({ actionName: "tasks.create", input: { title: "t" }, reason: "x" })).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("no false success", () => {
  it("a failing transport propagates — the agent never reports a silent success", async () => {
    const submit = vi.fn(async (): Promise<SubmitResult> => {
      throw new Error("server rejected (409)");
    });
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const leads: ScoredLead[] = [{ lead_id: "l1", name: "x", score: 99 }];
    await expect(proposeFollowUps(proposer, leads, { threshold: 0 })).rejects.toThrow("server rejected");
  });
});

describe("idempotency: replay yields identical keys", () => {
  it("the same inputs produce the same idempotency keys on re-run (server dedupes)", async () => {
    const leads: ScoredLead[] = [
      { lead_id: "a", name: "A", score: 90 },
      { lead_id: "b", name: "B", score: 85 },
    ];
    const run1 = recordingSubmit();
    const run2 = recordingSubmit();
    await proposeFollowUps(createActionProposer(run1.submit, () => "DRAFT_APPROVAL"), leads, { threshold: 80 });
    await proposeFollowUps(createActionProposer(run2.submit, () => "DRAFT_APPROVAL"), leads, { threshold: 80 });
    expect(run1.seen.map((p) => p.idempotencyKey)).toEqual(run2.seen.map((p) => p.idempotencyKey));
    expect(run1.seen.map((p) => p.idempotencyKey)).toEqual(["crm-followup-a", "crm-followup-b"]);
  });
});

describe("empty-input safety across agent families", () => {
  it("finance: no invoices → no overdue, no proposals", async () => {
    const { submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    expect(overdueInvoices([] as Invoice[])).toEqual([]);
    expect(await proposeDunningDrafts(proposer, [])).toEqual([]);
    expect(submit).not.toHaveBeenCalled();
  });

  it("hr: no shifts → no conflicts, and the data-quality flag is always honest", () => {
    const report = staffingReport([], []);
    expect(report.conflicts).toEqual([]);
    expect(report.unassignedShiftCount).toBe(0);
    expect(report.dataQuality.actualHoursAvailable).toBe(false); // never claims actual hours we don't have
  });

  it("crm: empty scored leads → no follow-ups", async () => {
    const { submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    expect(await proposeFollowUps(proposer, [], {})).toEqual([]);
    expect(submit).not.toHaveBeenCalled();
  });
});
