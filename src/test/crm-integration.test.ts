/**
 * CRM integration: compose multiple CRM agent capabilities through ONE shared
 * propose-only proposer and assert the global safety invariants hold end-to-end:
 *  - every proposal targets a known registry action,
 *  - every high-risk action is awaiting_approval even under AUTO,
 *  - nothing ever proposes email.send,
 *  - idempotency keys are unique across the whole run.
 */
import { describe, it, expect, vi } from "vitest";
import { createActionProposer, ACTION_RISK, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";
import { proposeDiscoveredLeads, type Candidate } from "@/mastra/agents/crm/company-discovery";
import { proposeFollowUps, type ScoredLead } from "@/mastra/agents/crm/lead-prioritizer";
import { proposeStalledNudges, type Deal } from "@/mastra/agents/crm/stalled-deals";
import { proposeHandoff } from "@/mastra/agents/crm/deal-handoff";
import { proposeSequence } from "@/mastra/agents/crm/followup-sequence";
import { proposePipelineUpdates } from "@/mastra/agents/crm/pipeline-suggester";
import type { Recipient } from "@/mastra/agents/crm/email-drafter";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("CRM capabilities compose through one proposer with the safety invariants intact", () => {
  it("runs discovery → prioritize → stalled → sequence → handoff → pipeline under AUTO", async () => {
    const { seen, submit } = recordingSubmit();
    // AUTO everywhere — the strongest test: high-risk must STILL never auto-approve.
    const proposer = createActionProposer(submit, () => "AUTO");

    const candidates: Candidate[] = [
      { source: "cvr", sourceId: "100", company_name: "Nyt Firma ApS", email: "kontakt@nyt.dk" },
    ];
    const scored: ScoredLead[] = [{ lead_id: "l1", name: "Hot Lead", score: 95 }];
    const deals: Deal[] = [
      { id: "d1", title: "Stale", stage: "proposal", value: 10000, currency: "DKK", updated_at: daysAgo(40) },
      { id: "d2", title: "Won deal", stage: "won", value: 50000, currency: "DKK", updated_at: daysAgo(2) },
    ];
    const recipient: Recipient = { id: "l1", name: "Hot Lead", relationship: "inbound_lead" };

    await proposeDiscoveredLeads(proposer, candidates, []);
    await proposeFollowUps(proposer, scored, { threshold: 80 });
    await proposeStalledNudges(proposer, deals, { maxIdleDays: 14, now: NOW });
    await proposeSequence(proposer, recipient, NOW);
    await proposeHandoff(proposer, { ...deals[1], customer_id: "cust-1" });
    await proposePipelineUpdates(proposer, deals, ["proposal", "negotiation", "won"], { d1: 2 });

    expect(seen.length).toBeGreaterThan(0);

    // 1. Every proposal targets a known registry action.
    for (const p of seen) expect(ACTION_RISK[p.actionName]).toBeDefined();

    // 2. High-risk actions are never auto-approved, even under AUTO.
    for (const p of seen) {
      if (ACTION_RISK[p.actionName] !== "low") expect(p.requestedApproval).toBe("awaiting_approval");
    }

    // 3. Nothing ever sends an email.
    expect(seen.some((p) => p.actionName === "email.send")).toBe(false);

    // 4. Idempotency keys are unique across the whole composed run.
    const keys = seen.map((p) => p.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("OFF across all capabilities proposes absolutely nothing", async () => {
    const { submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "OFF");
    await proposeDiscoveredLeads(proposer, [{ source: "cvr", sourceId: "1", company_name: "X", email: "x@x.dk" }], []);
    await proposeFollowUps(proposer, [{ lead_id: "l", name: "n", score: 99 }], { threshold: 0 });
    await proposeStalledNudges(proposer, [{ id: "d", title: "t", stage: "open", value: 1, updated_at: daysAgo(99) }], { now: NOW });
    expect(submit).not.toHaveBeenCalled();
  });
});
