import { describe, it, expect, vi } from "vitest";
import { planHandoff, proposeHandoff, type HandoffContext } from "@/mastra/agents/crm/deal-handoff";
import type { Deal } from "@/mastra/agents/crm/stalled-deals";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const wonWithCustomer: Deal & { customer_id?: string | null } = {
  id: "d1", title: "Acme", stage: "Won", value: 25000, currency: "DKK", updated_at: "2026-10-01T00:00:00Z",
  customer_id: "cust-1",
};
const wonNoCustomer: Deal & { customer_id?: string | null } = {
  id: "d2", title: "Beta", stage: "won", value: 12000, currency: "DKK", updated_at: "2026-10-01T00:00:00Z",
  customer_id: null,
};
const openDeal: Deal & { customer_id?: string | null } = {
  id: "d3", title: "Gamma", stage: "proposal", value: 5000, updated_at: "2026-10-01T00:00:00Z", customer_id: null,
};

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("planHandoff", () => {
  it("non-won deals produce no hand-off", () => {
    expect(planHandoff(openDeal)).toEqual([]);
  });

  it("won deal with a customer: onboarding task + invoice DRAFT are proposed", () => {
    const plan = planHandoff(wonWithCustomer);
    expect(plan.map((s) => [s.actionName, s.status])).toEqual([
      ["tasks.create", "proposed"],
      ["invoice.create", "proposed"],
    ]);
    expect(plan.find((s) => s.actionName === "invoice.create")!.input).toMatchObject({
      customer_id: "cust-1",
      amount: 25000,
    });
  });

  it("won deal without a customer and without contact data: customer BLOCKED, invoice DEFERRED (no fabricated data)", () => {
    const plan = planHandoff(wonNoCustomer);
    expect(plan.map((s) => [s.actionName, s.status])).toEqual([
      ["crm.customer.create", "blocked"],
      ["tasks.create", "proposed"],
      ["invoice.create", "deferred"],
    ]);
    // Blocked customer step carries no invented name/email.
    expect(plan[0].input).toEqual({});
    expect(plan[2].input).not.toHaveProperty("customer_id");
  });

  it("won deal without a customer but with real contact: customer.create is proposed", () => {
    const ctx: HandoffContext = { contact: { name: "Beta ApS", email: "kontakt@beta.dk" } };
    const plan = planHandoff(wonNoCustomer, ctx);
    expect(plan[0]).toMatchObject({ actionName: "crm.customer.create", status: "proposed" });
    expect(plan[0].input).toMatchObject({ name: "Beta ApS", email: "kontakt@beta.dk" });
  });
});

describe("proposeHandoff", () => {
  it("submits only the proposed steps; blocked/deferred are never sent", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const { submitted } = await proposeHandoff(proposer, wonNoCustomer);
    // Only the onboarding task is proposable here.
    expect(seen.map((p) => p.actionName)).toEqual(["tasks.create"]);
    expect(seen[0].requestedApproval).toBe("awaiting_approval");
    expect(submitted.map((s) => s.step)).toEqual(["tasks.create"]);
  });

  it("with a customer, submits task + invoice DRAFT, idempotency keyed per deal", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    await proposeHandoff(proposer, wonWithCustomer);
    expect(seen.map((p) => p.actionName)).toEqual(["tasks.create", "invoice.create"]);
    expect(seen.map((p) => p.idempotencyKey)).toEqual(["crm-handoff-task-d1", "crm-handoff-invoice-d1"]);
  });
});
