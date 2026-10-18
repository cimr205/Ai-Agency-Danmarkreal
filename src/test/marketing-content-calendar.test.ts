import { describe, it, expect, vi } from "vitest";
import { generateCalendar, proposeCalendar, type CalendarOptions } from "@/mastra/agents/marketing/content-calendar";
import type { CompanyKnowledge, Channel } from "@/mastra/agents/marketing/post-drafter";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const company: CompanyKnowledge = {
  name: "AI Agency Danmark",
  valueProposition: "Vi automatiserer salg og marketing",
  services: ["CRM", "Marketing"],
  url: "https://example.test",
};
// 2026-10-19 is a Monday (UTC).
const START = Date.parse("2026-10-19T00:00:00Z");
const channels: Channel[] = ["facebook", "instagram", "linkedin"];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("generateCalendar", () => {
  it("is deterministic and respects the weekly cadence over the window", () => {
    const a = generateCalendar(company, { startMs: START, channels, postsPerWeek: 3, days: 30 });
    const b = generateCalendar(company, { startMs: START, channels, postsPerWeek: 3, days: 30 });
    expect(a).toEqual(b); // deterministic
    // 3 posts/week over ~30 days ≈ 12-14 entries.
    expect(a.length).toBeGreaterThanOrEqual(12);
    expect(a.length).toBeLessThanOrEqual(15);
    // All dates are within the 30-day window and strictly increasing.
    const dates = a.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("rotates channels and carries draft text + publish-support flag", () => {
    const entries = generateCalendar(company, { startMs: START, channels, postsPerWeek: 3, days: 21 });
    expect(new Set(entries.map((e) => e.channel)).size).toBeGreaterThan(1); // rotation
    const li = entries.find((e) => e.channel === "linkedin")!;
    expect(li.publishSupported).toBe(false); // LinkedIn has no connector → draft only
    expect(li.text).toContain("automatiserer salg");
  });
});

describe("proposeCalendar", () => {
  it("proposes a marketing.campaign.create DRAFT per entry with a scheduled date; unique keys; never publishes", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const results = await proposeCalendar(proposer, company, { startMs: START, channels, postsPerWeek: 2, days: 14 });

    expect(seen.length).toBe(results.length);
    expect(seen.every((p) => p.actionName === "marketing.campaign.create")).toBe(true);
    expect(seen.every((p) => typeof p.input.scheduled_date === "string")).toBe(true);
    const keys = seen.map((p) => p.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length); // no collisions across the calendar
  });
});
