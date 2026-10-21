import { describe, it, expect, vi } from "vitest";
import { isRelevant, relevantTrends, proposeTrendIdeas, type TrendSignal } from "@/mastra/agents/marketing/trend-monitor";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const dAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);
const keywords = ["marketing automation", "CRM", "AI"];

const signals: TrendSignal[] = [
  { topic: "AI marketing", score: 90, market: "DK", source: "https://trends.dk/ai", sourceDate: dAgo(2) }, // relevant, fresh
  { topic: "CRM integrations", score: 75, market: "DK", source: "https://trends.dk/crm", sourceDate: dAgo(20) }, // relevant but STALE
  { topic: "Fishing rods", score: 95, market: "DK", source: "https://trends.dk/fish", sourceDate: dAgo(1) }, // irrelevant
  { topic: "AI marketing", score: 60, market: "DK", source: "https://trends.dk/ai2", sourceDate: dAgo(1) }, // duplicate topic
  { topic: "AI tools", score: 80, market: "SE", source: "https://trends.se/ai", sourceDate: dAgo(1) }, // wrong market
  { topic: "AI", score: 40, market: "DK", source: "https://trends.dk/low", sourceDate: dAgo(1) }, // below threshold
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("isRelevant", () => {
  it("matches on shared keyword tokens only", () => {
    expect(isRelevant("AI marketing tips", keywords)).toBe(true);
    expect(isRelevant("Fishing rods", keywords)).toBe(false);
  });
});

describe("relevantTrends", () => {
  it("filters by market, score, relevance; dedupes topic; flags stale; sorts by score", () => {
    const r = relevantTrends(signals, keywords, { market: "DK", minScore: 50, maxAgeDays: 14, now: NOW });
    expect(r.map((t) => t.topic)).toEqual(["AI marketing", "CRM integrations"]); // dedup keeps score 90; sorted
    expect(r.find((t) => t.topic === "CRM integrations")!.stale).toBe(true);
    expect(r.find((t) => t.topic === "AI marketing")!.stale).toBe(false);
  });
});

describe("proposeTrendIdeas", () => {
  it("proposes tasks.create ideas only for fresh relevant trends; nothing published", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const results = await proposeTrendIdeas(proposer, signals, keywords, { market: "DK", now: NOW });

    // Only the fresh relevant one (AI marketing) → one proposal; stale CRM excluded.
    expect(seen).toHaveLength(1);
    expect(seen[0].actionName).toBe("tasks.create");
    expect(seen[0].idempotencyKey).toBe("mkt-trend-dk-ai-marketing");
    expect(results).toHaveLength(1);
  });
});
