# Mastra End-to-End QA (QA-1) — Two-Tenant Verification

**Date:** 2026-10-20 · **Worktree:** `/Users/macbookpro/mastra-worktree` (`chore/mastra-install`)
**Mission:** prove the complete Mastra agent→Action Registry→approval→execution→DB→UI pipeline works safely across two independent tenants, using an **isolated local Supabase** — never production.

## Headline

> **BLOCKED — the primary goal cannot run on this machine.** No container runtime is installed, so `supabase start` (local isolated Supabase) is impossible. Per the mission's explicit rule ("If Docker or local Supabase is unavailable, document the blocker and stop the affected tests. **Do not switch to production**"), the DB-dependent E2E was **not run** and production was **not touched**. What does not need a live DB was verified and passes.

## Environment check (evidence)

| Requirement | Result | Evidence |
|---|---|---|
| Docker / Podman / any container runtime | **ABSENT** | `docker`, `podman`, `colima`, `nerdctl`, `orbstack`, `lima` all "not found"; no `/Applications/Docker.app`; no docker socket |
| Supabase CLI | present (2.116.0) | `/usr/local/bin/supabase` |
| `supabase start` (local DB) | **FAILS** | `supabase status` → `"docker: command not found (podman also not found) — install Docker Desktop or Podman"` |
| `supabase/` project (config, migrations, functions) | present | `config.toml`, `migrations/`, `functions/ai-operating-manager` etc. |
| Playwright (authenticated E2E) | **NOT SET UP** | no `playwright.config.*`, no `e2e/`, no installed browsers (`~/Library/Caches/ms-playwright` empty) |
| Auth test accounts | **ABSENT** | "Confirm email" ON; no safe non-prod accounts; the only auth-touching test targets the **real** Supabase project and self-skips without a service-role key |
| Dev server `:8080` | up (not restarted) | `curl` → 200 throughout; owned by another agent's Vite — left untouched |

## Results by mission step

| # | Step | Status | Note |
|---|---|---|---|
| 1 | Inspect repo/branches/localhost/QA docs | **PASS** | 6 worktrees; on `chore/mastra-install`; others not touched |
| 2 | Isolated local Supabase (if Docker available) | **BLOCKED** | no container runtime → `supabase start` impossible |
| 3 | Never connect to production Supabase | **HONORED** | no test user/seed/write to production; integration test left skipped |
| 4 | Two test companies (users/roles/records) | **BLOCKED** | needs the local DB from step 2 |
| 5 | agent→registry→proposal→approval→execution→DB→UI | **BLOCKED (live)** / **PASS (contract layer)** | live persistence needs the DB; the client-side propose-only contract + mode gating are unit-verified (see below) |
| 6 | Rejected / edited / duplicate / retry / unauthorized | **BLOCKED (live)** / **PARTIAL (static+unit)** | server handlers for reject/edit/idempotentReplay/403 exist (static review); negative-path logic unit-tested; live execution not run |
| 7 | Cross-tenant isolation (A cannot touch B) | **BLOCKED (live)** / **PARTIAL (static)** | RLS + `company_id` scoping present in server code (static review); cannot be *demonstrated* without two live tenants |
| 8 | OFF / DRAFT_APPROVAL / AUTO | **PASS (contract)** / **NOT_TESTED (server execution)** | proposer mode gating unit-verified; server-side auto-approve execution needs the DB |
| 9 | Authenticated Playwright suite | **BLOCKED** | Playwright not configured and no browsers installed in this worktree |
| 10 | Regression + typecheck + build | **PASS** | see below |

## PASS (verified without a live DB)

- **Regression:** `npx vitest run` → **195 passed / 2 skipped** (39 files). The 2 skipped are the auth-gated `tenant-isolation.integration.test.ts` (targets real Supabase — correctly skipped, not run against production).
- **Build:** `npm run build` → **✓ built in 31.5s**, no errors.
- **Typecheck (`src/mastra`):** clean. (Pre-existing errors in another agent's files are not in scope and were not touched.)
- **Propose-only contract + mode gating (client layer):** `src/test/mastra-action-proposal.test.ts` + `src/test/system-verification.test.ts` verify: OFF proposes nothing; DRAFT_APPROVAL always awaits approval; AUTO requests auto-approval only for low-risk actions; unknown actions rejected; idempotency keys stable on re-run; failing transport surfaces an error (no false success). **This is the client/contract layer, not server-enforced DB persistence.**
- **Dev server unaffected:** `:8080` returned 200 before/during/after; not restarted.

## Static review (logic EXISTS — but NOT_TESTED live)

`supabase/functions/ai-operating-manager/index.ts` (784 lines) + `_shared/auth.ts` contain the pipeline the mission wants to prove. Reviewed, not executed:
- **Tenant isolation anchor:** `requireCompanyAuth` → 401 without a token; derives `company_id` from the authenticated user's `profiles` row; 403 if none. Every data query and write is `.eq("company_id", companyId)`.
- **Role gating:** `canExecute(definition, roles)` → 403 "You do not have permission to approve this action"; per-action `requiredRoles` (MEMBER vs MANAGER).
- **Proposal:** inserts `autopilot_actions` with `company_id`, `user_id`, `idempotency_key`, `status:"awaiting_approval"`.
- **Idempotency / retry:** lookup by `company_id + idempotency_key`; already-`completed/executed` returns `{ idempotentReplay: true }`.
- **approve / reject / edit:** present; `edit` re-scopes the update by `company_id`; **audit()** writes before/after to `ai_action_audit`.

> These are promising but **unverified at runtime**. They are reported as **NOT_TESTED (live)** — not PASS — because the mission requires demonstrated persistence + cross-tenant enforcement, which needs the local DB.

## FAIL

None. Nothing tested produced a failure; the blocked items were not run (so they are BLOCKED/NOT_TESTED, never FAIL or false PASS).

## How to unblock (exact steps)

1. Install a container runtime: **Docker Desktop**, **OrbStack**, or **colima** (e.g. `brew install colima docker && colima start`). Note: local Supabase runs ~10 containers; on this **8 GB Intel** machine that is heavy and may contend with the `:8080` dev server — a ≥16 GB machine is strongly recommended.
2. `cd supabase && supabase start` → isolated local DB + Auth (prints local `SUPABASE_URL`, `anon`, `service_role` keys). **Use only these local keys** — never production.
3. `supabase db reset` to apply `migrations/` + seed; create **Company A** and **Company B** with distinct users/roles/records via local Auth admin (service-role on the *local* instance only).
4. Point the app/tests at the local keys; add a Playwright config + `npx playwright install`; write the two-tenant authenticated flows.
5. Run: proposal→approval→execution→persistence; reject/edit/duplicate/retry/unauthorized; cross-tenant (A's user/agent must get 401/403/empty on B's data); OFF/DRAFT_APPROVAL/AUTO.
6. Re-run regression/typecheck/build; record evidence here and flip BLOCKED → PASS/FAIL per result.

## Success condition — status

**NOT MET (BLOCKED), honestly.** Both tenants' authenticated E2E, live persistence, and *demonstrated* cross-tenant isolation require the local Supabase that cannot start without Docker. The client-contract layer passes, the server logic is present (static), and production was never touched. Install a container runtime (ideally on a ≥16 GB machine) to complete QA-1.

_No deploy, no push, no production access, no real payments/emails/external actions. Other agents' worktrees and the shared `:8080` were not modified._

---

# QA-1 unblock WITHOUT Docker — dedicated test-project path (2026-10-20)

Rather than install a heavy local container stack on this 8 GB Mac, the preferred, lighter path is a **dedicated non-production Supabase test project**. The full harness is now built and unit-verified; the ONLY remaining blocker is the owner providing test-project credentials.

## Built & verified (no external creds needed)

| Item | Status | Evidence |
|---|---|---|
| Production guards (`src/mastra/e2e/testenv.ts`) | **PASS** | refuses missing creds, prod-URL match, prod project-id, and absence of `E2E_ALLOW_TEST_PROJECT`; unit-tested |
| Two-tenant provisioning + marker-scoped cleanup (`provision.ts`) | **PASS** | `src/test/e2e-infra.test.ts` — **9/9**: creates 2 companies, confirmed users, roles, seed records; cleanup deletes ONLY `[e2e-qa]`-marked companies + `@e2e.aiagencydk.test` users, never untagged rows |
| supabase-js adapter (`supabase-port.ts`) | **PREPARED** | service-role + anon clients; built only after the guard passes |
| Runner scripts (`scripts/e2e/{apply-migrations.sh,setup-tenants.mts,cleanup.mts}`) | **PASS (guard demo)** | all exit `2` with clear BLOCKED messages when creds/ack missing; migration script refuses a production-matching URL |
| Playwright suite (`e2e/tests/*.spec.ts`, 7 specs) | **PREPARED (cannot run without creds+browser)** | covers proposal→approval→execution→persistence, cross-tenant 404/RLS, role 403, OFF/DRAFT_APPROVAL/AUTO, idempotency/replay, CRM/Mkt/Fin/HR, UI login smoke |
| Regression + typecheck | **PASS** | **204 passed / 2 skipped**; `src/mastra` typecheck clean; `e2e/` specs out of tsc scope |

A real bug was found & fixed while unit-testing cleanup: it iterated the auth-user list while deleting from it (would skip users); now snapshots the list first.

## Still BLOCKED — exact owner input required

Provide a **separate (non-production) Supabase project** and these env vars (see `e2e/README.md`):
`TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY`, `TEST_SUPABASE_DB_URL`, `E2E_ALLOW_TEST_PROJECT=1`. Then one-time `npm i -D @playwright/test && npx playwright install chromium`.

With those, the sequence is: `apply-migrations.sh` → `setup-tenants.mts` → `playwright test` → `cleanup.mts`. **Never provide production URLs/keys** — the guards will refuse them anyway.

## NOT_TESTED (live) until the above is supplied
Live persistence, approval→execution, cross-tenant RLS enforcement, authenticated UI, and the OFF/DRAFT_APPROVAL/AUTO runtime behavior — all **prepared** but not run. No live E2E PASS is claimed.

---

# QA-1 live run against the connected test project (2026-10-21)

**Test project:** `users` (`upqzzkdqlaqzgprufzrf`, eu-west-3) — owner-confirmed as the dedicated NON-production project. **Production (`crater-crm` `vbxlpxhvojlaisxcipyh`) was never touched.** Verified distinct by host + ref (`verify-not-production` → PASS).

## Done against the live test DB
| Step | Status | Evidence |
|---|---|---|
| Non-production preflight | ✅ **PASS** | test host/ref provably ≠ production |
| Apply 66 migrations | ✅ **DONE** | via Management API (token; no DB password). All 10 core tables present (`companies, profiles, user_roles, autopilot_actions, ai_action_audit, leads, deals, tasks, customers, onboarding_templates`) |
| Provision Company A + B | ✅ **DONE** | A (owner+employee) + B (manager+employee), roles + seed leads/deals/tasks; confirmed users via admin API |
| **Authenticated login** | ✅ **PASS** | both A-owner and B-manager signed in via real GoTrue password grant |
| **Cross-tenant RLS isolation (step 7/10)** | ✅ **PASS (live)** | A sees its own 2 leads, A→B company = **0**; B sees its own 2 leads, B→A company = **0**. PostgREST RLS enforces tenant boundary with real JWTs |
| Regression + typecheck | ✅ **PASS** | 204 passed / 2 skipped; `src/mastra` clean |

## Findings (real bugs / drift discovered while connecting the project)
1. **Broken migration** — `20260912000001_deal_won_onboarding.sql` line 111 has an **unescaped apostrophe** inside a jsonb string literal (`the customer's accounts`). It is invalid SQL and **fails on any fresh DB apply**. Applied a *test-only in-memory* fix (file on disk untouched — owned by another agent). **Recommend fixing the committed file** (`customer's` → `customer''s`).
2. **Stale `types.ts`** — the committed Supabase types disagree with the migrations: `user_roles` has **no `company_id`** (roles are per-user; company comes from `profiles.company_id`), and `leads` has **no `record_type`**. Provisioning was corrected to the real schema.
3. **Auto-provisioning trigger** — `handle_new_user` pre-creates a `profiles` row + a default `user_roles('employee')` on user creation; provisioning UPDATEs them rather than inserting.

## BLOCKED — needs one owner decision
The core pipeline specs (01 proposal→approval→execution→persistence, 03 role-gating, 04 modes, 05 idempotency/retry, 06 CRM/Mkt/Fin/HR, + audit) call the **`ai-operating-manager` edge function**, which is **not deployed to the test project**. Deploying it was **auto-denied by the standing "never deploy" boundary** (correctly — a hosted-function deploy is a deploy). Local serving needs Docker (unavailable). So these remain **NOT_TESTED (live)**.

**To finish QA-1**, the owner must either explicitly authorize deploying `ai-operating-manager` to the TEST project only (a scoped exception to the no-deploy rule), or provide a Docker runtime for local serving. Everything else (project connect, migrations, provisioning, auth, RLS isolation) is **green**.

## UI spec (07)
macOS 13 can't run bundled Chromium; configured to use system Google Chrome (`channel:"chrome"`). Runnable once the pipeline above is unblocked.

---

# QA-1 COMPLETE — full authenticated E2E PASS (2026-10-21)

Owner authorized a scoped exception to deploy **only** to the test project. `ai-operating-manager` was deployed to `upqzzkdqlaqzgprufzrf` (test) — production never touched. The full authenticated pipeline then ran green.

## Playwright authenticated suite — **12/12 PASS** (live, against the test DB)
| Spec | Scenario | Result |
|---|---|---|
| 01 | propose → approve → execute → **DB persistence** + audit (`event_type=completed`) | ✅ PASS |
| 02 | Company B cannot approve A's action → **404**; B cannot read A's rows → **RLS empty** | ✅✅ PASS |
| 03 | employee cannot approve a manager-only action → **403** | ✅ PASS |
| 04 | **DRAFT_APPROVAL** awaits approval; **OFF/AUTO** never auto-execute high-risk | ✅✅ PASS |
| 05 | same idempotency key → **no duplicate**; re-approve → **`idempotentReplay`** | ✅✅ PASS |
| 06 | **CRM** lead · **Marketing** campaign (draft) · **Finance** customer→invoice (draft, no payment) · **HR** employee → all propose→approve→persist | ✅✅✅✅ PASS |

Direct function smoke also confirmed: propose `201 awaiting_approval` → approve `200 completed` → persisted (`autopilot_actions.status=completed`, correct `company_id`) → re-approve `idempotentReplay:true`.

## Cleanup (step 12) — marker-scoped, verified
`cleanup.mts` removed ONLY `[e2e-qa]` data: 2 companies, 4 users, 4 profiles, 4 user_roles, 42 audit, 22 actions, 1 invoice, 1 campaign, 1 employee, 9 tasks, 4 deals, 4 leads, 2 customers. Post-check: `test_companies=0, leads=0, actions=0`. No untagged/production data touched.

## Final verification
Regression **204 passed / 2 skipped**, `src/mastra` typecheck clean, `npm run build` ✓, `localhost:8080` still 200 (not restarted).

## Status by scenario
- **PASS (live):** auth login · proposals · approvals · execution · **DB persistence** · **cross-tenant RLS isolation** · **role authorization (403)** · OFF/DRAFT_APPROVAL/AUTO · **idempotency/duplicate-execution** · retry · audit trail · CRM/Marketing/Finance/HR flows · cleanup.
- **NOT_TESTED:** spec 07 authenticated **UI render** — the app's password login routes through the Railway API (`api.aiagencydanmark.dk`), not the test Supabase project, so test users can't sign in through the real frontend against the test DB without repointing the app's API base. The data/authorization layer (the QA-1 substance) is fully covered above. Honestly held NOT_TESTED, not faked.
- **FAIL:** none.

## QA-1 verdict: **PASS** (data + authorization + pipeline layer)
Both tenants pass authenticated E2E, all permitted agent actions persist correctly, mandatory approval boundaries are enforced (high-risk never auto-executes; wrong role → 403), and cross-tenant isolation is demonstrated (404 + RLS). The only open item is the UI-render smoke, blocked by the frontend's separate Railway auth path — documented, not a safety gap in the Mastra→Action Registry pipeline.
