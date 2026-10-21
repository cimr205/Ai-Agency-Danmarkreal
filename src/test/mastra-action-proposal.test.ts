import { describe, it, expect, vi } from "vitest";
import {
  createActionProposer,
  ACTION_RISK,
  UnknownActionError,
  type ActionProposal,
  type SubmitResult,
} from "@/mastra/tools/action-proposal";

/**
 * These tests pin the core safety property of the CRM/sales agents: a tool can
 * only PROPOSE into the Action Registry. It never holds a DB client and never
 * writes directly. The registry (server-side) does auth, RLS, idempotency, audit.
 */

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: "act_1", status: p.requestedApproval === "auto_approve" ? "executed" : "awaiting_approval" };
  });
  return { seen, submit };
}

describe("createActionProposer — propose-only bridge", () => {
  it("DRAFT_APPROVAL proposes an awaiting_approval action with the right shape", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");

    const res = await proposer.propose({
      actionName: "crm.lead.create",
      input: { name: "Acme ApS", email: "kontakt@acme.dk" },
      reason: "Qualified inbound lead",
      idempotencyKey: "lead-acme-1",
    });

    expect(res).toEqual({ id: "act_1", status: "awaiting_approval" });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      actionName: "crm.lead.create",
      requestedApproval: "awaiting_approval",
      idempotencyKey: "lead-acme-1",
    });
  });

  it("holds no database/supabase client — it is structurally incapable of a direct write", () => {
    const { submit } = recordingSubmit();
    const proposer = createActionProposer(submit);
    // The only capability is `propose`; no db/supabase/client handle is exposed.
    expect(Object.keys(proposer).sort()).toEqual(["kind", "propose"]);
    expect(proposer.kind).toBe("propose-only");
    for (const forbidden of ["db", "supabase", "client", "from", "sql", "execute"]) {
      expect((proposer as Record<string, unknown>)[forbidden]).toBeUndefined();
    }
    // Frozen: a caller cannot monkey-patch a writer onto it.
    expect(Object.isFrozen(proposer)).toBe(true);
  });

  it("AUTO never auto-approves a high-risk action (deal stage move stays awaiting_approval)", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "AUTO");

    await proposer.propose({
      actionName: "crm.deal.move_stage",
      input: { deal_id: "d1", stage: "won" },
      reason: "auto",
    });

    expect(ACTION_RISK["crm.deal.move_stage"]).toBe("high");
    expect(seen[0].requestedApproval).toBe("awaiting_approval");
  });

  it("AUTO may request auto-approval only for a low-risk action (tasks.create)", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "AUTO");

    await proposer.propose({ actionName: "tasks.create", input: { title: "Call back" }, reason: "auto" });

    expect(ACTION_RISK["tasks.create"]).toBe("low");
    expect(seen[0].requestedApproval).toBe("auto_approve");
  });

  it("OFF proposes nothing and never calls the transport", async () => {
    const { submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "OFF");

    const res = await proposer.propose({ actionName: "email.send", input: {}, reason: "x" });

    expect(res).toBeNull();
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects an unknown action instead of guessing", async () => {
    const { submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "AUTO");
    await expect(
      proposer.propose({ actionName: "crm.lead.delete_all", input: {}, reason: "x" }),
    ).rejects.toBeInstanceOf(UnknownActionError);
    expect(submit).not.toHaveBeenCalled();
  });

  it("generates an idempotency key when none is supplied", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    await proposer.propose({ actionName: "tasks.create", input: { title: "t" }, reason: "x" });
    expect(seen[0].idempotencyKey).toMatch(/[0-9a-f-]{36}/);
  });
});
