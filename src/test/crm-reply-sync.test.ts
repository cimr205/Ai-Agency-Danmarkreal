import { describe, it, expect, vi } from "vitest";
import { matchRepliesToLeads, proposeReplyReviews, type InboundReply, type LeadRef } from "@/mastra/agents/crm/reply-sync";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const leads: LeadRef[] = [
  { id: "l1", name: "Mette", email: "mette@acme.dk" },
  { id: "l2", name: "Jens", email: "jens@beta.dk" },
];
const replies: InboundReply[] = [
  { id: "r1", fromEmail: "Mette@Acme.dk", subject: "Re: tilbud", receivedAt: "2026-10-19" }, // matches l1 (case-insensitive)
  { id: "r2", fromEmail: "stranger@nowhere.dk", subject: "Hi" }, // unmatched
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("matchRepliesToLeads", () => {
  it("matches by sender email (case-insensitive); reports unmatched instead of guessing", () => {
    const { matched, unmatched } = matchRepliesToLeads(replies, leads);
    expect(matched).toHaveLength(1);
    expect(matched[0].lead.id).toBe("l1");
    expect(unmatched.map((r) => r.id)).toEqual(["r2"]);
  });
});

describe("proposeReplyReviews", () => {
  it("proposes a tasks.create review per matched reply; unmatched reported; nothing updated/sent", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const outcomes = await proposeReplyReviews(proposer, replies, leads);

    expect(seen).toHaveLength(1);
    expect(seen[0].actionName).toBe("tasks.create");
    expect(seen[0].idempotencyKey).toBe("crm-reply-r1");
    expect(seen.some((p) => p.actionName === "crm.lead.update")).toBe(false); // no such action; never fabricated
    expect(seen.some((p) => p.actionName === "email.send")).toBe(false);

    expect(outcomes.find((o) => o.replyId === "r1")).toMatchObject({ status: "proposed", leadId: "l1" });
    expect(outcomes.find((o) => o.replyId === "r2")).toMatchObject({ status: "unmatched" });
  });

  it("OFF proposes nothing", async () => {
    const { submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "OFF");
    await proposeReplyReviews(proposer, replies, leads);
    expect(submit).not.toHaveBeenCalled();
  });
});
