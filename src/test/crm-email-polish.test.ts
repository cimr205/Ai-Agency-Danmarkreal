import { describe, it, expect, vi } from "vitest";
import { proposePolishedEmailDrafts, type PolishFn } from "@/mastra/agents/crm/email-polish";
import type { Recipient } from "@/mastra/agents/crm/email-drafter";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const recipients: Recipient[] = [
  { id: "r1", name: "Anna Hansen", company_name: "Novo", relationship: "existing_customer" },
  { id: "r2", name: "Bo", relationship: undefined }, // no lawful basis
  { id: "r3", name: "Cia", hasLegalBasis: true },
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("proposePolishedEmailDrafts", () => {
  it("skips recipients without a lawful basis (never drafted/sent)", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const res = await proposePolishedEmailDrafts(proposer, recipients, "opfølgning");
    expect(res.find((x) => x.recipientId === "r2")).toMatchObject({ status: "skipped" });
    expect(seen.some((p) => (p.input as { lead_id?: string }).lead_id === "r2")).toBe(false);
  });

  it("never emits email.send — always a tasks.create draft", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    await proposePolishedEmailDrafts(proposer, recipients, "opfølgning");
    expect(seen.length).toBe(2); // r1 + r3
    expect(seen.every((p) => p.actionName === "tasks.create")).toBe(true);
    expect(seen.every((p) => p.idempotencyKey.startsWith("crm-emaildraft-"))).toBe(true);
  });

  it("uses the polished body when a polish function returns text", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const polish: PolishFn = async () => "FORBEDRET BRØDTEKST";
    const res = await proposePolishedEmailDrafts(proposer, recipients, "opfølgning", polish);
    expect(res.filter((x) => x.polished).map((x) => x.recipientId).sort()).toEqual(["r1", "r3"]);
    expect(seen.every((p) => (p.input as { description: string }).description.includes("FORBEDRET BRØDTEKST"))).toBe(true);
    expect(seen.every((p) => (p.input as { description: string }).description.includes("LLM-polished"))).toBe(true);
  });

  it("falls back to the deterministic draft when polish fails (simple task never blocked)", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const polish: PolishFn = async () => { throw new Error("model unavailable"); };
    const res = await proposePolishedEmailDrafts(proposer, recipients, "opfølgning", polish);
    expect(res.filter((x) => x.status === "proposed").every((x) => x.polished === false)).toBe(true);
    // still proposed with the template body (contains the Danish greeting)
    expect(seen.every((p) => (p.input as { description: string }).description.includes("Hej"))).toBe(true);
  });
});
