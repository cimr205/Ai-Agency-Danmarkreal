import { describe, it, expect, vi } from "vitest";
import {
  draftEmail,
  hasLawfulBasis,
  proposeEmailDrafts,
  NoLegalBasisError,
  type Recipient,
} from "@/mastra/agents/crm/email-drafter";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const inbound: Recipient = { id: "l1", name: "Mette Hansen", company_name: "Acme ApS", relationship: "inbound_lead" };
const customer: Recipient = { id: "c1", name: "Jens", company_name: "Beta", hasLegalBasis: true };
const cold: Recipient = { id: "x1", name: "Ukendt", company_name: "Gamma" }; // no basis

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("lawful basis", () => {
  it("recognises inbound leads, opted-in and explicit legal basis; refuses cold contacts", () => {
    expect(hasLawfulBasis(inbound)).toBe(true);
    expect(hasLawfulBasis(customer)).toBe(true);
    expect(hasLawfulBasis(cold)).toBe(false);
  });
});

describe("draftEmail", () => {
  it("personalizes from real fields only", () => {
    const d = draftEmail(inbound, "jeres marketing-opsætning");
    expect(d.body).toContain("Hej Mette,");
    expect(d.subject).toContain("Acme ApS");
    expect(d.body).toContain("jeres marketing-opsætning");
  });

  it("throws rather than draft cold outreach", () => {
    expect(() => draftEmail(cold, "tilbud")).toThrow(NoLegalBasisError);
  });

  it("omits missing personalization instead of guessing", () => {
    const d = draftEmail({ id: "l2", relationship: "inbound_lead" }, "opfølgning");
    expect(d.body).toContain("Hej,"); // no invented name
    expect(d.subject).toBe("opfølgning"); // no invented company
  });
});

describe("proposeEmailDrafts", () => {
  it("proposes a tasks.create DRAFT (never email.send); skips cold recipients", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const out = await proposeEmailDrafts(proposer, [inbound, customer, cold], "jeres opsætning");

    expect(seen.map((p) => p.actionName)).toEqual(["tasks.create", "tasks.create"]);
    expect(seen.some((p) => p.actionName === "email.send")).toBe(false);
    expect(out.find((o) => o.recipientId === "x1")).toMatchObject({ status: "skipped" });
    expect(seen.map((p) => p.idempotencyKey)).toEqual(["crm-emaildraft-l1", "crm-emaildraft-c1"]);
  });
});
