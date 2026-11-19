// Regression coverage for lead-gen-api, the edge function actually backing
// the live, routed Lead Generation UI (src/pages/app/crm/LeadGenerationPage.tsx
// via src/hooks/api/useLeadGen.ts). This is the real lead-search feature;
// the separately-deployed `lead-generation-chat` function implements
// overlapping functionality (SSE chat-based search) but has no frontend
// caller anywhere — see docs/launch/VERSION_2_STATUS.md. Building a second
// UI for it would duplicate this already-shipped feature, so this file
// hardens the one that's actually live instead.
//
// Deno edge function — can't be imported into this Vite/tsc project (same
// constraint as the other *-live.test.ts files in this directory). Guarded
// via source-text assertions.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(
  path.resolve(process.cwd(), 'supabase/functions/lead-gen-api/index.ts'),
  'utf-8',
);

describe('lead-gen-api — authenticated routes', () => {
  it('getAuthContext rejects a missing/invalid session before resolving a company', () => {
    expect(SRC).toMatch(/if \(!authHeader\) throw new Error\("Unauthorized"\)/);
    expect(SRC).toMatch(/if \(error \|\| !user\) throw new Error\("Unauthorized"\)/);
  });

  it('fails closed when the authenticated user has no company', () => {
    expect(SRC).toMatch(/if \(!profile\?\.company_id\) throw new Error\("No company associated"\)/);
  });

  it('every session/result query is scoped by the caller\'s own company_id, not a client-supplied one', () => {
    const scopedCalls = SRC.match(/\.eq\("company_id", companyId\)/g) ?? [];
    expect(scopedCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('refuses a new search while one is already running for the company, auto-completing only genuinely stuck sessions', () => {
    expect(SRC).toMatch(/STUCK_SESSION_THRESHOLD_MS/);
    expect(SRC).toMatch(/return errorResponse\("A session is already running", 409\)/);
  });

  it('import only moves result_ids that belong to the caller\'s own session/company (not an arbitrary id list)', () => {
    expect(SRC).toMatch(/action === "sessions" && resourceId && subAction === "import"/);
  });
});

describe('lead-gen-api — /worker route (fixed 2026-11-11)', () => {
  // Was: no auth beyond the platform's verify_jwt (accepts the public anon
  // key), and companyId trusted straight from the request body with no
  // check that sessionId actually belonged to it. Fixed by (1) requiring the
  // Authorization header to be this function's own service-role secret, and
  // (2) re-deriving company_id from the session row itself rather than
  // trusting the body.
  const workerBlockMatch = SRC.match(/if \(req\.method === "POST" && action === "worker"\) \{[\s\S]*?\n {4}\}/);

  it('the worker route exists and is isolated to its own block', () => {
    expect(workerBlockMatch).not.toBeNull();
  });

  it('rejects any caller whose Authorization header is not this function\'s own service-role secret, compared in constant time', () => {
    expect(workerBlockMatch![0]).toMatch(/constantTimeEqual\(authHeader, `Bearer \$\{SUPABASE_SERVICE_ROLE_KEY\}`\)/);
    expect(workerBlockMatch![0]).toMatch(/return errorResponse\("Unauthorized", 401\)/);
  });

  it('never trusts the client-supplied companyId for the actual work — re-derives it from the session row', () => {
    expect(workerBlockMatch![0]).toMatch(/\.from\("lead_gen_sessions"\)\.select\("company_id"\)\.eq\("id", sessionId\)/);
    expect(workerBlockMatch![0]).toMatch(/session\.company_id !== companyId/);
    expect(workerBlockMatch![0]).toMatch(/runPipeline\(sessionId, session\.company_id,/);
  });

  it('the one legitimate caller (POST /sessions\' fire-and-forget fetch) already sends the matching service-role Authorization header', () => {
    const sessionsBlockMatch = SRC.match(/const workerUrl[\s\S]*?\}\)\.catch/);
    expect(sessionsBlockMatch).not.toBeNull();
    expect(sessionsBlockMatch![0]).toMatch(/Authorization: `Bearer \$\{SUPABASE_SERVICE_ROLE_KEY\}`/);
  });
});

describe('lead-gen-api — resilience', () => {
  it('external fetches are time-bounded, not allowed to hang the pipeline indefinitely', () => {
    expect(SRC).toMatch(/async function fetchWithTimeout/);
    expect(SRC).toMatch(/AbortController/);
  });

  it('an Apify fallback failure is caught and logged, not left to crash the whole search', () => {
    expect(SRC).toMatch(/catch \(error\) \{ console\.warn\("Apify fallback error:", error\); return \[\]; \}/);
  });
});
