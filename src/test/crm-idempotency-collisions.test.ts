/**
 * Hardening: cross-module idempotency-key collision guard.
 *
 * The server dedupes by (company_id, idempotency_key). If two DIFFERENT proposals
 * from different CRM capabilities ever shared a key for the same entity, one would
 * be silently dropped on replay. This test runs every CRM proposer over a dataset
 * that deliberately reuses the SAME lead/deal IDs and asserts all idempotency keys
 * are globally unique — i.e. each capability namespaces its keys.
 */
import { describe, it, expect, vi } from "vitest";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";
import { proposeFollowUps, type ScoredLead } from "@/mastra/agents/crm/lead-prioritizer";
import { proposeStalledNudges, type Deal } from "@/mastra/agents/crm/stalled-deals";
import { proposeHandoff } from "@/mastra/agents/crm/deal-handoff";
import { proposeSequence } from "@/mastra/agents/crm/followup-sequence";
import { proposePipelineUpdates } from "@/mastra/agents/crm/pipeline-suggester";
import { proposeEmailDrafts } from "@/mastra/agents/crm/email-drafter";
import { proposeReplyReviews } from "@/mastra/agents/crm/reply-sync";
import { proposeDiscoveredLeads } from "@/mastra/agents/crm/company-discovery";
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

describe("cross-module idempotency keys never collide (same entity IDs reused everywhere)", () => {
  it("every proposed key across all CRM capabilities is globally unique", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");

    // Deliberately reuse id "shared1" for a lead AND a deal to force any latent collision.
    const scored: ScoredLead[] = [{ lead_id: "shared1", name: "Shared", score: 95 }];
    const deals: Deal[] = [
      { id: "shared1", title: "Shared Deal", stage: "proposal", value: 10000, currency: "DKK", updated_at: daysAgo(40) },
      { id: "won1", title: "Won", stage: "won", value: 20000, currency: "DKK", updated_at: daysAgo(1) },
    ];
    const recipient: Recipient = { id: "shared1", name: "Shared", relationship: "inbound_lead" };

    await proposeFollowUps(proposer, scored, { threshold: 80 });
    await proposeStalledNudges(proposer, deals, { maxIdleDays: 14, now: NOW });
    await proposeSequence(proposer, recipient, NOW);
    await proposeHandoff(proposer, { ...deals[1], customer_id: "cust-1" });
    await proposePipelineUpdates(proposer, deals, ["proposal", "negotiation", "won"], { shared1: 2 });
    await proposeEmailDrafts(proposer, [recipient], "opfølgning");
    await proposeReplyReviews(proposer, [{ id: "shared1", fromEmail: "x@shared.dk" }], [{ id: "shared1", email: "x@shared.dk" }]);
    await proposeDiscoveredLeads(proposer, [{ source: "cvr", sourceId: "shared1", company_name: "Shared ApS", email: "new@shared.dk" }], []);

    const keys = seen.map((p) => p.idempotencyKey);
    expect(keys.length).toBeGreaterThan(5);

    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(dupes).toEqual([]); // no cross-module collisions
    expect(new Set(keys).size).toBe(keys.length);

    // Spot-check that keys are namespaced per capability even for the shared id.
    const sharedKeys = keys.filter((k) => k.includes("shared1"));
    expect(new Set(sharedKeys).size).toBe(sharedKeys.length);
    expect(sharedKeys.some((k) => k.startsWith("crm-followup-"))).toBe(true);
    expect(sharedKeys.some((k) => k.startsWith("crm-stalled-"))).toBe(true);
    expect(sharedKeys.some((k) => k.startsWith("crm-seq-"))).toBe(true);
    expect(sharedKeys.some((k) => k.startsWith("crm-reply-"))).toBe(true);
  });
});
