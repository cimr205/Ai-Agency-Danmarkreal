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

---

## E2E-006

**Severity:** P0
**Area:** Security — cross-tenant privilege escalation via SECURITY DEFINER RPCs
**Persona/Environment:** Any authenticated `company_admin`, any company — production
**Reproduction:** Found via a full read-only SQL sweep of every `SECURITY DEFINER` function in `public` (checking each one that takes a caller-supplied `_company_id`/`_user_id` parameter for whether it actually verifies that id belongs to the caller). `set_company_mode(_company_id, _mode)` and `update_compliance_item(_company_id, _item, _value)` both checked only `is_company_admin(auth.uid())` — which confirms the caller is an admin of *their own* company, never that the caller-supplied `_company_id` argument is that same company. Contrast with `regenerate_activation_code(_company_id)`, which gets it right: `get_user_company_id(auth.uid()) = _company_id AND has_role(auth.uid(),'company_admin')`.
**Expected:** A company_admin can only change settings for their own company.
**Actual:** Any company_admin, of any company, could call either RPC with an arbitrary victim `_company_id` and silently overwrite that other company's `mode` setting or `compliance_checklist` — a real cross-tenant write, not just a read leak.
**Root cause:** Missing `_company_id` ownership check — ownership of the resource being mutated was never verified against the authenticated caller.
**Files changed:** `supabase/migrations/20260904000002_fix_cross_tenant_company_settings_functions.sql` — both functions now also require `get_user_company_id(auth.uid()) = _company_id`, matching `regenerate_activation_code`'s correct pattern. Applied live.
**Test added:** none (same test-infra gap noted throughout this doc).
**Status:** FIXED, VERIFIED via `pg_get_functiondef` re-read post-migration confirming the new check is live in both function bodies. NOT re-tested with an actual live cross-tenant call attempt (would require a second real tenant/admin session — this pass has credentials for only one tenant, see the scope-honesty statement at the top of this doc). The fix is a straightforward, correct SQL predicate addition with a proven-correct sibling function as the pattern, so this is high-confidence without a live attack retest, reported honestly as not literally re-attacked.

---

## E2E-007

**Severity:** P1
**Area:** CRM — Deals list completely empty (PostgREST ambiguous-embed error)
**Persona/Environment:** Any company member viewing the Deals page — production
**Reproduction:** Live business-journey test: converted a real lead ("Cimraan") to a deal via "Convert to Deal". Redirected to `/crm/deals`. Page showed "No deals yet" despite 3 real deal rows existing in the `deals` table for this exact company (verified via direct DB query — the newly converted deal, an existing "QA Test Deal", and a peer session's "TEST E2E Audit Deal" test row). Confirmed via network-request inspection: the `GET /rest/v1/deals?select=*,customers(name,email)&order=created_at.desc` request returned **HTTP 300** (PostgREST's "ambiguous embedded resource" error) — the request was failing silently (no toast, `useDeals()`'s `error` state wasn't being surfaced to the UI), and `isEmpty` in `DealsPage.tsx` (`!isLoading && deals.length === 0`) can't distinguish "genuinely no deals" from "the query errored out to zero results" — a second, smaller bug worth separately noting.
**Expected:** The Deals page lists every deal belonging to the company, including newly converted ones.
**Actual:** Deals page always showed empty, for every deal, regardless of how many actually existed.
**Root cause:** `customers.converted_deal_id → deals.id` is a foreign key added by this session's earlier lead→customer/deal merge work (the "convert lead to deal" feature creates a linked customer row with `converted_deal_id` pointing back at the new deal). Combined with the pre-existing `deals.customer_id → customers.id` FK, there are now **two** distinct relationship paths between `deals` and `customers` — PostgREST can no longer infer which one `select=*, customers(name,email)` should embed through, and returns HTTP 300 instead of guessing. Every `useDeals()`/`useUpdateDeal()` call was affected identically, so this broke the Deals page (and DealsPage's own row-update path) universally, not just for the newly converted deal.
**Files changed:** `src/hooks/api/useDeals.ts` — both `.select('*, customers(name, email)')` call sites now use the explicit relationship hint `.select('*, customers!deals_customer_id_fkey(name, email)')`, disambiguating in favor of the intended forward relationship. Checked the rest of the frontend for the same `customers(...)` embed pattern on other tables (`invoices` in `useFinance.ts`) — confirmed via `pg_constraint` that `invoices`↔`customers` has only one FK path each direction, so those were not affected and needed no change.
**Test added:** none (same test-infra gap).
**Status:** FIXED, VERIFIED. Live re-test post-deploy: Deals page now shows "Total Deals: 3" with correct computed KPIs (Pipeline Value 62.500 kr., Won Value 50.000 kr., Avg. Deal Value 20.833 kr.), the board view renders all 3 real deals in their correct stage columns (including "Deal: Cimraan", the one that was invisible before the fix). Confirmed via network inspection: `GET /rest/v1/deals?select=*,customers!deals_customer_id_fkey(name,email)&order=created_at.desc` now returns **200** (previously 300).

**Secondary, smaller finding (not separately numbered):** `useDeals()`'s query error is never surfaced to the user — a failed fetch renders identically to "no deals exist," which is exactly how this P1 stayed invisible in the UI (no error toast, no visible signal something was wrong) despite the network tab showing a clear 300. Worth adding real error-state UI to `DealsPage.tsx` as a follow-up; not fixed in this pass (scope: fixing the actual data bug took priority over the error-surfacing UX gap).

---

## E2E-008

**Severity:** P1
**Area:** AI — Deal Coach, Operating Manager panel (deal detail), Autopilot Brief — same ambiguous-embed regression as E2E-007, on the backend this time
**Persona/Environment:** Any company member clicking "Analyze Deal" on a real deal — production
**Reproduction:** Live business-journey test, continued from E2E-007: opened the now-visible "Deal: Cimraan" detail sheet, clicked "Analyze Deal" (AI Deal Coach). Got a "Deal not found" toast for a deal that plainly exists (same deal just confirmed real in E2E-007).
**Expected:** A real AI analysis of the deal (win probability, risk, recommended actions).
**Actual:** `deal-coach` edge function's own `.from("deals").select("*, customers(name, email)")...single()` hit the identical PostgREST 300 ambiguous-embed error from E2E-007 (the new `customers.converted_deal_id → deals.id` FK) — server-side this time, collapsed into a generic "Deal not found" by the function's error handling. Grepped the whole `supabase/functions` tree for the same pattern and found two more real hits: `ai-operating-manager/index.ts` (the entity-context lookup powering the visible Operating Manager panel when it's viewing a deal) and `autopilot-brief/index.ts` (open-deals list for the daily business brief) — both would have failed identically whenever exercised against a deal.
**Root cause:** Same as E2E-007 — `customers(...)` embedded directly off `deals` is now ambiguous between the `deals.customer_id` and `customers.converted_deal_id` FK paths. This is backend code, entirely separate from the frontend `useDeals()` fix, so fixing the frontend didn't touch these.
**Files changed:** `deal-coach/index.ts`, `ai-operating-manager/index.ts`, `autopilot-brief/index.ts` — each `customers(...)` embed off `deals` disambiguated to `customers!deals_customer_id_fkey(...)`, matching the frontend fix. Also found and fixed a genuinely separate, pre-existing bug while touching `autopilot-brief`: its "recent payments" query tried to embed `customers(name)` directly off `payments`, but `payments` has no `customer_id` column at all (only `invoice_id`) — that embed could never have worked; repointed to `invoices(customers(name))` and updated the corresponding extraction code. (Caught only because a blind find-and-replace across the file first applied the wrong constraint name to this line and to the `invoices` line too — both reverted to correct forms before deploying; the `invoices` line needed no change at all, `payments` needed the real structural fix.)
**Test added:** none (same test-infra gap).
**Status:** FIXED and VERIFIED for `deal-coach` — live re-test: "Analyze Deal" on "Deal: Cimraan" now returns a real analysis (30% win probability, Medium risk, an accurate narrative referencing the deal's actual early-discovery/no-value state, and two concrete recommended actions) instead of 404ing. `ai-operating-manager` and `autopilot-brief` received the identical embed fix (plus the separate payments-embed structural fix for the latter) and were deployed, but were NOT independently click-tested in this pass — flagged honestly, not verified per-feature.

---

## E2E-009

**Severity:** P3
**Area:** Finance — Quote → Invoice conversion, wrong success toast + missing race-condition retry
**Persona/Environment:** Any company member accepting a quote and clicking "Create Invoice" — production
**Reproduction:** Continued the live business-journey test: created a real quote ("TEST E2E Quote", 10.000 kr. + 25% VAT = 12.500 kr.) for lead "Cimraan", sent it, accepted it, clicked "Create Invoice". A real invoice was created correctly (confirmed on the Invoices page: `2026-0003`, Cimraan, 12.500 kr., Draft) — the underlying feature works — but the success toast said **"Quote created"** instead of "Invoice created".
**Expected:** A toast confirming an invoice was created.
**Actual:** Misleading toast claiming a quote was created, right after the user just accepted an existing quote and asked for an invoice.
**Root cause:** `QuotesPage.tsx`'s `convertQuote` mutation's `onSuccess` reused `t('quotes.created')` ("Quote created") — the same key used for actual quote creation elsewhere in the same file — instead of a distinct invoice-created message. Copy-paste, not a logic bug.
**Secondary finding, fixed in the same pass:** this mutation hand-rolls its own `generate_invoice_number()` + `quote_to_invoice()` RPC pair with no retry, instead of going through the already-fixed `useCreateInvoice()` (E2E-002/003). The new `invoices.(company_id,invoice_number)` unique constraint means a race here would now surface as an uncaught `23505` error rather than a silent duplicate, but it would still fail the user's request outright instead of transparently retrying.
**Files changed:** `src/messages/{en,da,de}.json` — added a distinct `quotes.invoiceCreated` key. `src/pages/app/finance/QuotesPage.tsx` — `convertQuote` now shows `t('quotes.invoiceCreated')` on success, and wraps the number-generate-then-convert flow in the same 3-attempt retry-on-`23505` pattern already used by `useCreateInvoice`.
**Test added:** none (same test-infra gap).
**Status:** FIXED, VERIFIED. Live re-test post-deploy: created a fresh test quote, sent it, accepted it, clicked "Create Invoice" — toast now correctly reads "Invoice created". (The retry-loop path specifically was not force-raced, same reasoning as E2E-002/003: a real DB constraint plus narrow correct error-code matching is high-confidence without a forced race.)

---

## E2E-010

**Severity:** P2
**Area:** Marketing/Voice — hardcoded, always-green AI status badge
**Persona/Environment:** Any company member on the Voice Agent page — production
**Reproduction:** Open Marketing → Power Dialer/Voice Agent (once Twilio is connected). The "AI-model" card always showed a static `Badge variant="default"` reading "Ollama (selv-hostet)" with a green checkmark — this was never wired to any real health check, just always-rendered JSX.
**Expected:** The badge reflects the actual, live AI provider status (matching the pattern already correctly used on `AIConnectionPage.tsx`).
**Actual:** Category-4 invalid hardcoded state per this pass's own classification rule — claims "Ollama, online" unconditionally, even during the period this session confirmed Ollama was completely down, and even now that the real active provider is Groq.
**Root cause:** The card was written as static JSX with no data binding at all — not stale in the sense of "used to be true," it was never live.
**Files changed:** `src/pages/app/marketing/VoiceAgentPage.tsx` — now calls `useAIStatus()` (the same real health-check hook `AIConnectionPage.tsx` uses) and renders online/offline/loading states from the actual response.
**Test added:** none (same test-infra gap).
**Status:** FIXED. Type/lint-checked clean; not yet live-clicked (requires a connected Twilio account to reach this card — not attempted live this pass to avoid touching telephony state unnecessarily).

---

## E2E-011

**Severity:** P1
**Area:** Clients — CVR/company-name lookup silently broken for name search
**Persona/Environment:** Any company member creating a new client via "New Client" — production
**Reproduction:** Click "New Client", type a company name (e.g. "AI Agency Danmark") into the lookup field, whose own placeholder text explicitly invites "Indtast CVR-nummer eller virksomhedsnavn..." (CVR number or company name).
**Expected:** Per the placeholder's own promise, and per the backend's actual capability (confirmed: `cvr-search` passes the raw search term straight to `cvrapi.dk`, which genuinely supports name search), a name search should return the matching company.
**Actual:** `CvrLookupField.tsx` ran `cvr.replace(/\D/g, '')` (strip everything but digits) on the input before sending it — for a company name with zero digits, this produces an empty string, which then fails the `< 2 chars` check with a confusing "CVR-nummer skal være mindst 2 tegn" (CVR number must be at least 2 characters) error. Every name search was silently impossible despite the UI's own promise. Separately: the backend already returns `phone`/`email`/`website` when the registry has them, but the component's `onResult` callback only ever extracted `{name, address, cvr}` — that real data was fetched and then thrown away.
**Root cause:** The digit-stripping assumed CVR-only input from an earlier version of this field, never updated when the placeholder copy was changed to promise name search too. The discarded fields were a separate, smaller oversight in the same component.
**Files changed:** `src/components/shared/CvrLookupField.tsx` — removed the digit-stripping (the raw trimmed search term is now sent as-is; `cvrapi.dk` itself determines whether it's a CVR number or a name), and extended the result shape to include `zipcode`/`city`/`phone`/`email`/`website` (never fabricated — only passed through when the registry actually returned them). `src/pages/app/clients/ClientsListPage.tsx` (the only *live*-routed consumer — `CustomersPage.tsx` is confirmed dead/unrouted from earlier session work and was left untouched) — now prefills `phone`/`email` from the lookup result when the user hasn't already typed something, never overwriting real input.
**Test added:** none (same test-infra gap).
**Status:** FIXED, VERIFIED. Live re-test post-deploy: typed "Novo Nordisk" (a real company name, zero digits) into "New Client" → CVR-opslag, clicked search — correctly returned "NOVO NORDISK A/S", CVR 24256790, real address ("Novo Alle 1, 2880, Bagsværd"), and prefilled the phone number (44448888) from the registry. Previously this exact input would have failed with "CVR-nummer skal være mindst 2 tegn".

---

## E2E-012

**Severity:** P1
**Area:** Smart Inbox — "connected" state module couldn't actually use, no EXPIRED state
**Persona/Environment:** Any company that connected Gmail via the Integrations page (Composio) rather than a personal OAuth grant, viewing Smart Inbox — production. This is this exact test workspace's real state (confirmed via direct query: `email_accounts` is empty, `integrations` has a connected `gmail` row).
**Reproduction:** Open Smart Inbox for a Composio-only-connected workspace.
**Expected:** Either full sync support for however Gmail is connected, or — if that's not implemented — an honest, correctly-labeled state, never a silent failure loop.
**Actual, before this pass:** `useGmailAccount()` (drives the page's "Connected" badge) already correctly fell back to the Composio connection and reported connected — but `gmail-sync` (the function that actually fetches and stores messages) only ever checked the native `email_accounts` table, with no Composio path. Result: the page said "Connected" while sync could never work, returning a generic, unhelpful "No Gmail account connected" 404 — the exact anti-pattern this master prompt opens with as its lead example. Separately: the page's own auto-sync-on-mount effect had no guard for this case, so it silently re-attempted (and failed) the same broken sync on every single page load.
**Also found in the same pass:** `gmail-sync`'s token-refresh-failure path (Google returning `invalid_grant` for a revoked refresh token) never marked the account — every future sync would throw the same generic error forever, with no way for the UI to distinguish "was connected, now revoked" from "never connected". Worse: `useGmailAccount()`'s query filtered `status='connected'`, so even after adding a real 'expired' status write, an expired row would have been silently filtered out and made invisible to the frontend.
**Root cause:** `gmail-sync` was built against only the native OAuth path, before the Composio fallback existed elsewhere (`gmail-send`, `useGmailAccount`) — never updated to match. Token-refresh failure was never wired to a status write at all.
**Files changed:**
- `gmail-sync/index.ts` — on no native account, now checks for a Composio-connected Gmail integration and returns a distinct `COMPOSIO_ONLY_NOT_SYNCABLE` (409) instead of a generic 404; a revoked refresh token now writes `email_accounts.status='expired'`.
- `src/hooks/api/useEmail.ts` (`useGmailAccount`) — no longer filters out non-`connected` rows (only `disconnected` is treated as absent), so an `expired` row is now visible to the frontend instead of silently disappearing; guarded against the multi-row edge case (a disconnect-then-reconnect-different-address history) by ordering/limiting instead of `.single()`.
- `src/pages/app/email/EmailsPage.tsx` — the auto-sync-on-mount effect now skips entirely for Composio-only accounts and for expired accounts (it already correctly hid the manual Sync button for Composio — that part was already right); added a real, dedicated EXPIRED-state screen (distinct from "never connected") with a one-click reconnect.
**Test added:** none (same test-infra gap noted throughout this doc).
**Status:** FIXED, VERIFIED for the Composio-only case — live re-test post-deploy on this exact workspace: Smart Inbox correctly shows "Connected: Fælles Gmail (Integrationer)" with the honest "sync needs a personal connection" message (this part was already correct), and — confirmed via network-request inspection — **no `gmail-sync` call fires at all anymore** on page load (previously it would have fired and silently failed every time). The EXPIRED-state path (native account + revoked refresh token) was NOT live-tested — this workspace has no native `email_accounts` row to revoke, and deliberately revoking a real Google OAuth grant to force this path felt like an unnecessary destructive test against a real account; verified by code inspection and the `invalid_grant`-specific branch instead.
