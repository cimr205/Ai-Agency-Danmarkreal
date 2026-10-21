import { describe, it, expect, vi } from "vitest";
import { prepareCallList, proposeCallReminders, type CallableLead } from "@/mastra/agents/crm/calling-prep";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const leads: CallableLead[] = [
  { id: "a", name: "Hot", phone: "+4511111111", callConsent: true, score: 90 },
  { id: "b", name: "Warm", phone: "+4522222222", callConsent: true, score: 70 },
  { id: "c", name: "NoConsent", phone: "+4533333333", callConsent: false, score: 99 }, // excluded
  { id: "d", name: "NoPhone", phone: null, callConsent: true, score: 80 }, // excluded
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("prepareCallList", () => {
  it("includes only consented leads with a phone, sorted by score; excludes the rest with reasons", () => {
    const { callList, excluded } = prepareCallList(leads);
    expect(callList.map((c) => c.leadId)).toEqual(["a", "b"]); // sorted by score desc
    expect(excluded).toEqual([
      { leadId: "c", reason: "no_consent" },
      { leadId: "d", reason: "no_phone" },
    ]);
  });

  it("never fabricates consent or a phone", () => {
    const { callList } = prepareCallList([{ id: "x", score: 100 }]); // no consent, no phone
    expect(callList).toEqual([]);
  });
});

describe("proposeCallReminders", () => {
  it("proposes tasks.create call-back reminders only; never dials; excluded reported", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const { proposed, excluded } = await proposeCallReminders(proposer, leads);

    expect(seen.map((p) => p.actionName)).toEqual(["tasks.create", "tasks.create"]);
    expect(seen.map((p) => p.idempotencyKey)).toEqual(["crm-callback-a", "crm-callback-b"]);
    // No telephony/voice action is ever proposed.
    expect(seen.some((p) => /voice|call\.|dial|phone\./.test(p.actionName))).toBe(false);
    expect(proposed).toEqual(["a", "b"]);
    expect(excluded.map((e) => e.leadId)).toEqual(["c", "d"]);
  });

  it("OFF proposes nothing", async () => {
    const { submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "OFF");
    await proposeCallReminders(proposer, leads);
    expect(submit).not.toHaveBeenCalled();
  });
});
