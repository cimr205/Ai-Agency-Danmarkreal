import { describe, it, expect, vi } from "vitest";
import {
  normalizeName,
  dedupeCandidates,
  proposeDiscoveredLeads,
  type Candidate,
  type ExistingLead,
} from "@/mastra/agents/crm/company-discovery";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const existing: ExistingLead[] = [
  { id: "l1", company_name: "Acme ApS", email: "info@acme.dk" },
  { id: "l2", company_name: "Beta A/S", email: "hi@beta.dk", phone: "+4511111111" },
];

const candidates: Candidate[] = [
  { source: "cvr", sourceId: "111", company_name: "Acme", email: "sales@acme.dk" }, // dup by name (Acme ~ Acme ApS)
  { source: "cvr", sourceId: "222", company_name: "Gamma ApS", email: "kontakt@gamma.dk" }, // net-new w/ email
  { source: "cvr", sourceId: "333", company_name: "Delta Holding" }, // net-new, NO email
  { source: "cvr", sourceId: "222", company_name: "Gamma", email: "dup@gamma.dk" }, // dup within list (same id)
  { source: "companies_house", sourceId: "999", company_name: "Beta", phone: "+4511111111" }, // dup by phone
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("normalizeName", () => {
  it("strips legal suffixes and punctuation so Acme ApS == Acme", () => {
    expect(normalizeName("Acme ApS")).toBe(normalizeName("Acme"));
    expect(normalizeName("Beta A/S")).toBe("beta");
  });
});

describe("dedupeCandidates", () => {
  it("separates net-new from duplicates (existing + within-list + phone)", () => {
    const { netNew, duplicates } = dedupeCandidates(candidates, existing);
    expect(netNew.map((c) => c.sourceId).sort()).toEqual(["222", "333"]);
    expect(duplicates.map((d) => d.candidate.sourceId).sort()).toEqual(["111", "222", "999"]);
  });
});

describe("proposeDiscoveredLeads", () => {
  it("proposes crm.lead.create only for net-new with a real email; records source; skips no-email (no fabrication)", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const outcomes = await proposeDiscoveredLeads(proposer, candidates, existing);

    // Only Gamma (222) has an email among net-new → exactly one proposal.
    expect(seen).toHaveLength(1);
    expect(seen[0].actionName).toBe("crm.lead.create");
    expect(seen[0].idempotencyKey).toBe("crm-discovery-cvr-222");
    expect(seen[0].input).toMatchObject({ email: "kontakt@gamma.dk", company_name: "Gamma ApS" });

    // Delta (333) net-new but no email → skipped, not fabricated.
    expect(outcomes.find((o) => o.sourceId === "333")).toMatchObject({ status: "skipped_no_email" });
    expect(outcomes.filter((o) => o.status === "skipped_duplicate").length).toBe(3);
  });

  it("OFF proposes nothing", async () => {
    const { submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "OFF");
    await proposeDiscoveredLeads(proposer, candidates, existing);
    expect(submit).not.toHaveBeenCalled();
  });
});
