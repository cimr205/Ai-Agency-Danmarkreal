// Regression coverage for the two CRM AI edge functions that are actually
// live and wired to the UI (lead-ai-recommend -> usePipeline.ts,
// deal-coach -> DealCoachPanel.tsx) — unlike the much more thoroughly
// unit-tested Mastra agents in src/mastra/agents/crm/*, which have no live
// invocation path at all (see docs/launch/VERSION_2_STATUS.md). These two
// functions had zero test coverage before this file.
//
// Both are Deno edge functions (global `Deno`, `https://esm.sh/...` type-only
// imports) and can't be imported into this Vite/tsc project without breaking
// `npm run type-check` — same constraint documented in
// trial-overwrite-regression.test.ts and ai-model-fallback.test.ts. Guarded
// here the same way: source-text assertions pinning the safety properties
// that matter, so a future edit can't silently drop one.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const LEAD_RECOMMEND_SRC = readFileSync(
  path.resolve(process.cwd(), 'supabase/functions/lead-ai-recommend/index.ts'),
  'utf-8',
);
const DEAL_COACH_SRC = readFileSync(
  path.resolve(process.cwd(), 'supabase/functions/deal-coach/index.ts'),
  'utf-8',
);

describe.each([
  ['lead-ai-recommend', LEAD_RECOMMEND_SRC],
  ['deal-coach', DEAL_COACH_SRC],
])('%s — safety properties pinned by source guard', (_name, SRC) => {
  it('rejects a request with no/invalid auth before touching any data', () => {
    expect(SRC).toMatch(/if \(!user\)/);
    expect(SRC).toMatch(/status: 401/);
  });

  it('resolves company_id server-side from the authenticated profile, never from the request body', () => {
    expect(SRC).toMatch(/\.from\("profiles"\)\s*\n?\s*\.select\("company_id"\)/);
    expect(SRC).not.toMatch(/req\.json\(\)[\s\S]{0,80}company_id/); // company_id never read from the client payload
  });

  it('refuses to proceed when the authenticated user has no company (fails closed, not open)', () => {
    expect(SRC).toMatch(/if \(!profile\?\.company_id\)/);
    expect(SRC).toMatch(/status: 403/);
  });

  it('checks a usage quota before calling the AI provider — cost control is not optional', () => {
    expect(SRC).toMatch(/increment_usage_quota/);
    expect(SRC).toMatch(/withinQuota === false/);
    expect(SRC).toMatch(/status: 429/);
  });

  it('every entity fetch filters by the caller\'s own company_id (service-role client bypasses RLS, so this is the only guard)', () => {
    // Both functions fetch their primary entity (lead / deal) with an
    // explicit .eq("company_id", ...) alongside the id filter — not relying
    // on RLS, which the service-role client bypasses.
    expect(SRC).toMatch(/\.eq\("company_id", profile\.company_id\)/);
  });

  it('handles the AI provider being unreachable/unconfigured without crashing', () => {
    expect(SRC).toMatch(/AI_NOT_CONNECTED_MESSAGE/);
  });

  it('handles a non-ok AI response via the shared error describer, never a raw passthrough', () => {
    expect(SRC).toMatch(/describeOpenAIError/);
  });

  it('wraps the whole handler so an unexpected throw returns a clean 500, never an unhandled crash', () => {
    expect(SRC).toMatch(/catch \(e\)/);
    expect(SRC).toMatch(/status: 500/);
  });
});

describe('lead-ai-recommend specific', () => {
  it('requires lead_id and validates the AI response has the expected shape before returning it', () => {
    expect(LEAD_RECOMMEND_SRC).toMatch(/if \(!lead_id\)/);
    expect(LEAD_RECOMMEND_SRC).toMatch(/if \(!summary\.summary \|\| !summary\.risk_level\)/);
  });
});

describe('deal-coach specific', () => {
  it('requires deal_id', () => {
    expect(DEAL_COACH_SRC).toMatch(/if \(!deal_id\)/);
  });

  it('computes win rate defensively (no division by zero when the company has no closed deals yet)', () => {
    expect(DEAL_COACH_SRC).toMatch(/totalClosed > 0 \? Math\.round\(\(totalWon \/ totalClosed\) \* 100\) : 50/);
  });
});
