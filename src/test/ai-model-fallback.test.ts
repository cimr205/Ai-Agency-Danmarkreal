// Coverage for the OpenRouter free-model fallback (supabase/functions/_shared/aiConnection.ts),
// ported onto this branch on 2026-11-11 from origin/main (this branch had
// diverged before the feature landed there — see docs/launch/BRANCH_INVENTORY.md).
// Includes the MAX_MODELS=3 cap: OpenRouter rejects the whole request outright
// when `models` has more than 3 entries, so the regression that matters most
// here is "don't drop the cap", not just "fallback exists".
//
// The real functions live in a Deno edge function (global `Deno`, a
// `https://esm.sh/...` type-only import) and can't be imported into this
// Vite/tsc project without breaking `npm run type-check`. Guarded via source
// guards + a local mirror of each pure algorithm, same pattern as the other
// *-live.test.ts / *-regression.test.ts files in this directory.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const AI_CONNECTION_SRC = readFileSync(
  path.resolve(process.cwd(), 'supabase/functions/_shared/aiConnection.ts'),
  'utf-8',
);

describe('aiConnection.ts — source guards (regression)', () => {
  it('caps the fallback list at 3 — OpenRouter rejects the whole request above that', () => {
    expect(AI_CONNECTION_SRC).toMatch(/export const MAX_MODELS = 3;/);
    expect(AI_CONNECTION_SRC).toMatch(/\.slice\(0, MAX_MODELS\)/);
  });

  it('dedupes and leads with the primary model', () => {
    expect(AI_CONNECTION_SRC).toMatch(/\[primary, \.\.\.extra\]\.filter/);
  });

  it('getCompanyAI fails closed (returns null) when base URL or model is missing, not an exception', () => {
    expect(AI_CONNECTION_SRC).toMatch(/if \(!baseUrl \|\| !model\) return null;/);
  });

  it('describeOpenAIError maps an unknown-model 404 to a safe 503, not a raw passthrough', () => {
    expect(AI_CONNECTION_SRC).toMatch(/status: 503/);
  });
});

// Mirrors resolveModelList()'s algorithm: dedup, order-preserving, primary
// first, capped at MAX_MODELS.
const MAX_MODELS = 3;
function resolveModelList(primary: string, fallbackCsv: string | undefined): string[] {
  const extra = (fallbackCsv ?? '').split(',').map((m) => m.trim()).filter(Boolean);
  const seen = new Set<string>();
  return [primary, ...extra].filter((m) => (seen.has(m) ? false : (seen.add(m), true))).slice(0, MAX_MODELS);
}

describe('resolveModelList scenarios', () => {
  it('primary model only when no fallback is configured', () => {
    expect(resolveModelList('meta-llama/llama-3-8b', undefined)).toEqual(['meta-llama/llama-3-8b']);
  });

  it('orders fallbacks after the primary and removes an accidental duplicate of it', () => {
    expect(resolveModelList('model-a', 'model-b, model-a, model-c')).toEqual(['model-a', 'model-b', 'model-c']);
  });

  it('never exceeds MAX_MODELS even with a long configured fallback list', () => {
    const many = Array.from({ length: 20 }, (_, i) => `free-model-${i}`).join(',');
    const result = resolveModelList('model-a', many);
    expect(result).toHaveLength(MAX_MODELS);
    expect(result[0]).toBe('model-a');
  });

  it('ignores blank/whitespace entries from a malformed env value', () => {
    expect(resolveModelList('model-a', ' , model-b ,, ,model-c,')).toEqual(['model-a', 'model-b', 'model-c']);
  });
});

describe('every AI call site sends the models[] fallback, not just model', () => {
  const callers = [
    'linkedin-outreach', 'autopilot-brief', 'deal-coach', 'meta-ads-ai', 'gmail-sync',
    'lead-ai-recommend', 'ai-actions', 'workflow-assistant', 'lead-gen-api', 'meeting-summary',
    'voice-agent-respond', 'generate-call-script', 'csv-import-leads', 'ai-email-writer',
    'ai-health', 'workflow-runner', 'smart-assistant',
  ];

  it.each(callers)('%s sends models: ai.models alongside model: ai.model', (fn) => {
    const src = readFileSync(path.resolve(process.cwd(), `supabase/functions/${fn}/index.ts`), 'utf-8');
    expect(src).toMatch(/model: ai\.model, models: ai\.models,/);
  });
});
