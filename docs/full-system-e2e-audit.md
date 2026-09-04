# Full-System E2E Audit — AI Agency Danmark

Started: 2026-09-04

## Scope honesty statement (read first)

The master prompt for this audit calls for a full isolated two-tenant test
environment (Workspace A / Workspace B with seeded personas), destructive
concurrency tests (10-100 simultaneous invoice creations), 10k-100k lead
load testing, real OAuth provider-failure simulation, and a dedicated
`tests/` suite (unit/integration/e2e/security/tenancy/concurrency/perf).
None of that infrastructure exists yet and building it is itself a
multi-day project (test Supabase project or schema, seed scripts, a
second real tenant, Playwright/Vitest wiring).

Given that, this pass does NOT claim full coverage of all 60 steps. It
does real, verified testing (not a checklist of "would test") on the
subset that's safely executable against the single existing production
tenant this session has credentials for, using SQL introspection (safe,
read-only or clearly-labeled/cleaned-up test rows) and live browser
verification. Every item below is either genuinely FOUND+FIXED+VERIFIED,
or explicitly marked BLOCKED with the exact reason and what's needed to
unblock it. Nothing is marked VERIFIED without an actual retest.

## Format

```
E2E-XXX
Severity: P0/P1/P2/P3
Area:
Persona/Environment:
Reproduction:
Expected:
Actual:
Root cause:
Files changed:
Test added:
Status: FOUND / FIXING / FIXED / VERIFIED / BLOCKED
```

---

(Findings appended below as they're discovered.)

---

## E2E-001

**Severity:** P1
**Area:** AI / Operating Manager panel (frontend-wide, every page)
**Persona/Environment:** Any authenticated user, production
**Reproduction:** Load any `/app/*` page. Open browser console.
**Expected:** Operating Manager panel renders and, when queried, returns a real answer.
**Actual:** Uncaught exception on every page load: `Error: Den konfigurerede model er ikke hentet på den selv-hostede Ollama-instans.` at `WorkspaceShell-*.js`. The panel's chat input, when used, would fail identically.
**Root cause:** `supabase/functions/_shared/operatingModelRouter.ts` (which powers `ai-operating-manager`, the edge function behind the visible Operating Manager panel) was hardwired exclusively to a self-hosted Ollama instance (`LOCAL_LLM_BASE_URL`) that is confirmed down (Railway instance unreachable — established earlier this session during the Groq migration work). This function was explicitly out of scope for that migration (a separate, older system from the new `ai-message` engine), so it kept failing after Ollama went down.
**Files changed:** `supabase/functions/_shared/operatingModelRouter.ts` (`resolveModel`/`generateStructured` now route to Groq — `GROQ_API_KEY`/`GROQ_MODEL`/`GROQ_BASE_URL`, already configured secrets, already proven working this session for the new engine).
**Test added:** none (no existing test harness covers edge functions outside the AI engine's own `_shared/ai/tests/`; this file has no prior tests to extend). Verified via live browser instead — see below.
**Status:** VERIFIED — reloaded the Dashboard post-deploy: zero console errors/exceptions (previously 1 uncaught exception every load). Sent a real chat message ("Hvad er vigtigst lige nu?") through the panel and got a real, coherent, data-grounded response ("Der er ingen kritiske signaler i de aktuelle data.") instead of a crash.

**Known remaining scope (not fixed, logged honestly):** 16 other edge functions (`autopilot-brief`, `meta-ads-ai`, `deal-coach`, `gmail-sync`, `ai-email-writer`, `csv-import-leads`, `ai-actions`, `ai-health`, `lead-ai-recommend`, `workflow-assistant`, `workflow-runner`, `autopilot-agent`, `voice-agent-respond`, `smart-assistant`, `lead-gen-api`, `meeting-summary`) still import `_shared/aiConnection.ts`'s Ollama-only `getCompanyAI`/`describeOpenAIError` directly and will fail identically whenever they're exercised. Each AI-powered feature backed by one of these (AI Email Writer content generation, Lead AI Recommendations, ICP scoring inputs, Meeting Summary, Smart Assistant, Autopilot, Workflow Assistant, Voice Agent) is therefore currently non-functional in production. This is a separate, larger migration (17 call sites total across this list) — flagged as the single highest-value next fix, not completed in this pass due to time budget.

---

## E2E-003

**Severity:** P0
**Area:** Finance — Invoice creation (`generate_invoice_number` RPC + `useCreateInvoice`)
**Persona/Environment:** Any company member creating an invoice, production
**Reproduction:** Read `generate_invoice_number(_company_id)`'s definition directly (`pg_get_functiondef`): it runs `SELECT MAX(...)+1` over existing `invoice_number` rows with no row lock, no advisory lock, and no sequence. The frontend (`useCreateInvoice` in `src/hooks/api/useFinance.ts`) calls this RPC and then does a *separate* `INSERT` round trip — not inside one transaction, so no lock taken inside the function could span both calls anyway. Confirmed via `pg_get_constraintdef` on `public.invoices` that no unique or exclusion constraint existed on `(company_id, invoice_number)` before this fix — nothing would have caught a collision at insert time either.
**Expected:** Two invoices created for the same company at (near-)the same time always get two distinct invoice numbers.
**Actual:** Two concurrent invoice-creation requests can both read the same `MAX(...)`, both compute the same "next" number, and both insert successfully — two real invoices silently sharing one invoice number. (Not reproduced via a forced literal race in this pass — the shell classifier blocked backgrounded/parallel `&`-style command execution needed to fire truly simultaneous RPC calls — but the vulnerability is proven directly from the function body + absence of any constraint, which is airtight evidence independent of forcing an actual collision.)
**Root cause:** Non-locking `MAX+1` sequence generation combined with a two-round-trip client flow and no database-level uniqueness backstop.
**Files changed:**
- `supabase/migrations/20260904000001_invoice_number_unique_constraint.sql` — adds `invoices_company_invoice_number_unique unique (company_id, invoice_number)`. Verified zero existing duplicate `(company_id, invoice_number)` pairs before applying (query run first, 0 rows). Applied live via `supabase db query --linked -f`.
- `src/hooks/api/useFinance.ts` (`useCreateInvoice`) — wraps the generate-then-insert flow in a retry loop (max 3 attempts): on a `23505` unique-violation from the new constraint, re-generates a fresh number and retries; any other error, or exhausting retries, still throws. This turns what used to be silent duplicate-number corruption into either a transparent retry (common case) or a clear, thrown error (pathological case) — never a silent duplicate.
**Test added:** none yet — this repo has no Vitest/frontend test harness wired up (confirmed: no `tests/` directory, no `vitest.config`, `npm test` script exists per `package.json` but no test files were found for `useFinance.ts` or any hook). Adding one is out of scope for this pass; flagged as a real gap (see Step 1 infra note in the scope-honesty statement above).
**Status:** FIXED, partially VERIFIED. Verified: migration applied cleanly against production with zero pre-existing violations; `npm run check` passes; the constraint itself is now live (confirmed via `pg_get_constraintdef` after applying). NOT verified: an actual forced concurrent-race retest post-fix (blocked by the same shell-classifier restriction on parallel execution that prevented the original repro attempt). Given the fix is a real DB constraint (unconditionally enforced by Postgres regardless of how it's invoked) plus a retry loop with narrow, correct error-code matching, this is high-confidence without a forced-race retest, but is being reported honestly as not literally re-raced.

---

## E2E-004

**Severity:** P1
**Area:** AI — 16 additional edge functions sharing `_shared/aiConnection.ts`
**Persona/Environment:** Any company member using AI Email Writer, Lead AI Recommendations, ICP scoring, Meeting Summary, Smart Assistant, Autopilot, Workflow Assistant, Voice Agent, CSV import AI classification, Call script generation, Meta Ads AI, Deal Coach, Gmail sync AI classification, `ai-actions`, `ai-health`, `lead-gen-api` — production
**Reproduction:** Any of the above features, triggered while `LOCAL_LLM_BASE_URL` (dead Ollama instance) was the only configured model source.
**Expected:** Each feature calls a real, working model and returns a real result.
**Actual:** Every one of them would throw the same class of error E2E-001 found in the Operating Manager panel — same root cause (`_shared/aiConnection.ts`'s `getCompanyAI`/`describeOpenAIError`, imported by all 16), just not yet independently reproduced click-by-click for each feature (would require 16 separate live walkthroughs; instead fixed at the shared root and spot-verified via one representative caller — see below).
**Root cause:** Same as E2E-001 — `_shared/aiConnection.ts` resolved exclusively to the dead Ollama instance. All 16 dependent functions use a uniform OpenAI-compatible request shape (`ai.url`/`ai.model`/`ai.apiKey`, including tool-calling; `autopilot-agent` uses the Vercel AI SDK's `createOpenAICompatible` against the same fields) — confirmed via grep that no caller branches on `ai.provider`, so this was safe to fix once at the shared root rather than in 16 places.
**Files changed:** `supabase/functions/_shared/aiConnection.ts` (`getCompanyAI` now resolves to Groq via `GROQ_API_KEY`/`GROQ_MODEL`/`GROQ_BASE_URL`; `describeOpenAIError` generalized off Ollama-specific wording). All 17 dependent functions (`autopilot-brief`, `meta-ads-ai`, `deal-coach`, `gmail-sync`, `ai-email-writer`, `generate-call-script`, `csv-import-leads`, `ai-actions`, `ai-health`, `lead-ai-recommend`, `workflow-assistant`, `workflow-runner`, `autopilot-agent`, `voice-agent-respond`, `smart-assistant`, `lead-gen-api`, `meeting-summary`) redeployed to pick up the shared-file change — none needed their own code changed.
**Test added:** none (same test-infra gap as E2E-001/E2E-003).
**Status:** FIXED for all 17. VERIFIED end-to-end for `ai-email-writer` only (see E2E-005 below — generating a real AI email draft for a real lead now returns a coherent, personalized Danish email referencing the lead's actual company and phone number, where it previously 404'd). The other 15 are FIXED (same shared root cause, same deploy) but NOT individually click-tested in this pass — flagged honestly as not independently verified per-feature.

---

## E2E-005

**Severity:** P1
**Area:** CRM — 6 AI-powered features still reading the deprecated `leads` table
**Persona/Environment:** Any company member generating an AI email, ICP score, lead recommendation, autopilot brief, meeting summary (with a linked lead), or workflow suggestion — production
**Reproduction:** Open a real lead (e.g. "Cimraan", a live row in `customers` with `record_type='lead'`), click "AI Email Writer" → "Generate AI Email".
**Expected:** A real AI-generated email draft for that lead.
**Actual:** `{"error": "Lead not found"}` toast, 404. Confirmed via direct query: `leads` table has 1 stale row; the real, live lead data (3 rows, including the one just tested) lives in `customers` where `record_type = 'lead'` — this is the intended post-merge state per this session's earlier B1/B2a lead↔customer merge work (`docs/production-architecture.md`/plan history), which explicitly deferred repointing `ai-email-writer`, `icp-score`, `lead-ai-recommend`, `autopilot-brief`, `meeting-summary`, and `workflow-assistant` to a "B2b" pass "not yet started, no urgency (worst case is stale AI-tool reads, not data loss)" — that assumption undersold the impact: these features didn't just read *stale* data, they 404'd entirely for any lead that only exists in the new table (which by now is all of them for `ai-email-writer`/`lead-ai-recommend`/`meeting-summary`'s single-lead lookups; `icp-score`/`autopilot-brief`/`workflow-assistant`'s bulk queries would silently undercount/miscount instead of erroring).
**Root cause:** `.from("leads")` queries in all 6 functions, never repointed to `.from("customers").eq("record_type", "lead")` during the B2a migration.
**Files changed:** `ai-email-writer/index.ts`, `icp-score/index.ts`, `lead-ai-recommend/index.ts`, `autopilot-brief/index.ts`, `meeting-summary/index.ts`, `workflow-assistant/index.ts` — each `.from("leads")` call repointed to `.from("customers")...eq("record_type", "lead")`, same filters otherwise preserved.
**Test added:** none (same test-infra gap).
**Status:** FIXED and VERIFIED for `ai-email-writer` — live re-test after redeploy: "Generate AI Email" on the same lead ("Cimraan") now returns a real, coherent, personalized Danish draft ("Optimer kundeoplevelsen med vores testløsninger", referencing the lead's actual company name and phone number) instead of 404ing. The other 5 (`icp-score`, `lead-ai-recommend`, `autopilot-brief`, `meeting-summary`, `workflow-assistant`) received the identical fix and were deployed, but were NOT independently click-tested in this pass — flagged honestly, not verified per-feature.
