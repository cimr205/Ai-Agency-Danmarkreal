import { describe, it, expect, vi } from "vitest";
import {
  extractContact,
  costPerLead,
  proposeLeadsFromEvents,
  type LeadgenEvent,
} from "@/mastra/agents/marketing/results-feedback";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const metaRaw = (email?: string, name?: string, phone?: string) => ({
  field_data: [
    ...(email ? [{ name: "email", values: [email] }] : []),
    ...(name ? [{ name: "full_name", values: [name] }] : []),
    ...(phone ? [{ name: "phone_number", values: [phone] }] : []),
  ],
});

const events: LeadgenEvent[] = [
  { id: "e1", meta_campaign_id: "c1", raw: metaRaw("ny@lead.dk", "Ny Lead") }, // net-new
  { id: "e2", meta_campaign_id: "c1", raw: metaRaw("info@acme.dk", "Acme") }, // duplicate (existing)
  { id: "e3", meta_campaign_id: "c2", raw: metaRaw(undefined, "Ingen Email") }, // no email
  { id: "e4", meta_campaign_id: "c2", raw: metaRaw("ny@lead.dk", "Dup I Batch") }, // dup within batch
  { id: "e5", meta_campaign_id: "c2", customer_id: "cust-9", raw: metaRaw("linked@x.dk") }, // already linked
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("extractContact", () => {
  it("parses Meta field_data defensively", () => {
    expect(extractContact(metaRaw("a@b.dk", "A B", "+45"))).toEqual({ email: "a@b.dk", name: "A B", phone: "+45" });
  });
  it("returns only present fields — never invents", () => {
    expect(extractContact(metaRaw(undefined, "Only Name"))).toEqual({ name: "Only Name" });
    expect(extractContact(null)).toEqual({});
  });
});

describe("costPerLead", () => {
  it("counts leads per campaign and divides by real spend; null when spend unknown", () => {
    const stats = costPerLead(events, { c1: 1000 });
    const c1 = stats.find((s) => s.campaignId === "c1")!;
    const c2 = stats.find((s) => s.campaignId === "c2")!;
    expect(c1).toMatchObject({ leadCount: 2, spend: 1000, costPerLead: 500 });
    expect(c2.costPerLead).toBeNull(); // no spend provided for c2
  });
});

describe("proposeLeadsFromEvents", () => {
  it("proposes crm.lead.create only for net-new emailed, unlinked events; records source", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const outcomes = await proposeLeadsFromEvents(proposer, events, ["info@acme.dk"]);

    // Only e1 qualifies.
    expect(seen).toHaveLength(1);
    expect(seen[0].actionName).toBe("crm.lead.create");
    expect(seen[0].input).toMatchObject({ email: "ny@lead.dk", name: "Ny Lead" });
    expect(seen[0].idempotencyKey).toBe("mkt-leadgen-e1");

    expect(outcomes.find((o) => o.eventId === "e2")!.status).toBe("skipped_duplicate");
    expect(outcomes.find((o) => o.eventId === "e3")!.status).toBe("skipped_no_email");
    expect(outcomes.find((o) => o.eventId === "e4")!.status).toBe("skipped_duplicate");
    expect(outcomes.find((o) => o.eventId === "e5")!.status).toBe("skipped_already_linked");
  });
});
