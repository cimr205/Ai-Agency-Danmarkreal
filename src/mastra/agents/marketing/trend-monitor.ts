/**
 * Lawful trend monitoring (read-only, propose-only).
 *
 * Ingests trend signals that each carry an explicit SOURCE + DATE (from an
 * authorized API/source — supplied here, never scraped or invented), filters them
 * for relevance to the company's services/keywords in a chosen market, dedupes, and
 * flags stale signals. Relevant trends are surfaced as `tasks.create` content-idea
 * review DRAFTs — never auto-published, no fabricated metrics.
 *
 * Live trend sources are owner-authorized (OWNER_DECISIONS #5/FO-5); this module runs
 * on supplied, source-tagged inputs so the logic is testable without live access.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

export interface TrendSignal {
  topic: string;
  /** A normalized interest score 0..100 from the source (not invented). */
  score: number;
  market: string; // e.g. "DK"
  source: string; // URL / API name — required, verifiable
  sourceDate: string; // ISO date observed — required
}

export interface TrendOptions {
  /** Market to filter to. */
  market: string;
  /** Minimum score to consider. Default 50. */
  minScore?: number;
  /** Max age (days) before a signal is considered stale. Default 14. */
  maxAgeDays?: number;
  /** "Now" for deterministic tests. Default Date.now(). */
  now?: number;
}

const DAY_MS = 86_400_000;

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
}

/** True when a trend topic overlaps any company keyword/service token. */
export function isRelevant(topic: string, keywords: string[]): boolean {
  const topicTokens = new Set(tokens(topic));
  return keywords.some((k) => tokens(k).some((t) => topicTokens.has(t)));
}

export interface RankedTrend extends TrendSignal {
  ageDays: number;
  stale: boolean;
}

/** Relevant, in-market, above-threshold trends, de-duplicated by topic, highest score first. */
export function relevantTrends(signals: TrendSignal[], keywords: string[], opts: TrendOptions): RankedTrend[] {
  const minScore = opts.minScore ?? 50;
  const maxAge = opts.maxAgeDays ?? 14;
  const now = opts.now ?? Date.now();
  const seen = new Set<string>();
  const out: RankedTrend[] = [];
  for (const s of signals) {
    if (s.market.toUpperCase() !== opts.market.toUpperCase()) continue;
    if (s.score < minScore) continue;
    if (!isRelevant(s.topic, keywords)) continue;
    const key = s.topic.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    const ageDays = Math.floor((now - Date.parse(s.sourceDate)) / DAY_MS);
    out.push({ ...s, ageDays, stale: ageDays > maxAge });
  }
  return out.sort((a, b) => b.score - a.score);
}

type Proposer = ReturnType<typeof createActionProposer>;

/** Propose a content-idea review tasks.create DRAFT per fresh, relevant trend. Stale trends excluded. */
export async function proposeTrendIdeas(
  proposer: Proposer,
  signals: TrendSignal[],
  keywords: string[],
  opts: TrendOptions,
) {
  const fresh = relevantTrends(signals, keywords, opts).filter((t) => !t.stale);
  const results = [];
  for (const t of fresh) {
    results.push(
      await proposer.propose({
        actionName: "tasks.create",
        input: {
          title: `Content idea from trend: "${t.topic}" (${t.market}, score ${t.score})`,
          description: `Trending topic "${t.topic}" (score ${t.score}, observed ${t.sourceDate}, source: ${t.source}). Consider a post/campaign angle. (Proposed by the Marketing agent; approve to create the idea task. No content is published automatically.)`,
        },
        reason: `Relevant trend in ${t.market} (score ${t.score})`,
        idempotencyKey: `mkt-trend-${t.market}-${t.topic}`.toLowerCase().replace(/\s+/g, "-"),
      }),
    );
  }
  return results;
}
