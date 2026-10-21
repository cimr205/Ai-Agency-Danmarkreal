import { describe, it, expect, vi } from "vitest";
import { draftPost, CHANNEL_SPEC, proposePostDrafts, type CompanyKnowledge } from "@/mastra/agents/marketing/post-drafter";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const company: CompanyKnowledge = {
  name: "AI Agency Danmark",
  valueProposition: "Vi automatiserer salg og marketing for danske bureauer",
  services: ["CRM", "Marketing", "Automation"],
  url: "https://example.test",
};

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("draftPost", () => {
  it("builds a draft from supplied facts only, with channel hashtag count", () => {
    const d = draftPost(company, "instagram");
    expect(d.channel).toBe("instagram");
    expect(d.text).toContain("automatiserer salg");
    expect(d.text).toContain("https://example.test");
    expect(d.hashtags.length).toBeLessThanOrEqual(CHANNEL_SPEC.instagram.hashtags);
    expect(d.hashtags[0]?.startsWith("#")).toBe(true);
  });

  it("truncates to the channel max length", () => {
    const longCo = { ...company, valueProposition: "x".repeat(5000) };
    const d = draftPost(longCo, "shorts");
    expect(d.truncated).toBe(true);
    expect(d.text.length).toBeLessThanOrEqual(CHANNEL_SPEC.shorts.maxChars);
  });

  it("marks publish-unsupported channels (LinkedIn/TikTok) so nothing is auto-published", () => {
    expect(draftPost(company, "linkedin").publishSupported).toBe(false);
    expect(draftPost(company, "tiktok").publishSupported).toBe(false);
  });
});

describe("proposePostDrafts", () => {
  it("proposes a marketing.campaign.create DRAFT per channel; never publishes", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const results = await proposePostDrafts(proposer, company, ["facebook", "linkedin"]);
    expect(seen.map((p) => p.actionName)).toEqual(["marketing.campaign.create", "marketing.campaign.create"]);
    expect(seen.every((p) => p.requestedApproval === "awaiting_approval")).toBe(true);
    expect(seen[1].input.publish_supported).toBe(false); // linkedin
    expect(results).toHaveLength(2);
  });

  it("OFF proposes nothing", async () => {
    const { submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "OFF");
    const results = await proposePostDrafts(proposer, company, ["facebook"]);
    expect(submit).not.toHaveBeenCalled();
    expect(results.every((r) => r === null)).toBe(true);
  });
});
