# HR Agents & System Verification (QA) — Status

**Owner:** HR/QA loop (MASTERPROMPT 5) · **Worktree:** `/Users/macbookpro/hr-qa-worktree` · **Branch:** `feature/hr-qa-agents` (based on `feature/frontend-operating-system` @ `eeaa028`)
**Depends on:** Mastra platform (`chore/mastra-install`) + propose-only Action Registry bridge (`316e867`).
**Coordination:** reads `MASTER_STATE.md`, does NOT write it. Owner questions in local `HR_QA_DECISIONS.md`.
**Last updated:** 2026-10-19 (iteration 3 — system-verification negative-path suite; platform suite 91/91)

## Hard rules
- Work hours from **actual registration** (`attendance`), not just planned `shifts`. No automatic payroll payout; payroll prep is verified against real data only.
- **No individual-level** wellbeing/health/burnout inference. Only aggregated, privacy-preserving operational metrics with explicit data-quality notes.
- Every write via Action Registry (auth/RLS/idempotency/audit). OFF/DRAFT_APPROVAL/AUTO. Never show false success.
- Respect all parallel agents; no overwrite/reset/stash/process-kill. No push/deploy.

## HR inventory (verified read-only, 2026-10-18)
> **Correction (iteration 2):** iteration 1 over-listed tables from a loose text match. The HR tables that **actually exist** in `src/integrations/supabase/types.ts` are: **`employee_profiles`, `leave_requests`, `payroll`, `shifts`**. There is **no** `attendance`/`employees`/`work_schedule`/`recruitment` table. Consequence: **no actual-time (attendance/time-entries) table exists** → "work hours from actual registration" and payroll prep from actual hours are **BLOCKED** until such a table is added (HR_QA_DECISIONS HR-4). Planned shift hours must never be presented as worked hours.
- **Tables (actual):** `employee_profiles`, `shifts` (planned; assigned_employee_id, shift_date, start_time, end_time, status, department_id), `leave_requests` (employee_profile_id, start_date, end_date, status, type), `payroll`.
- **Pages:** `WorkSchedulePage`, `TimeTrackingPage`, `AttendancePage`, `LeavePage`, `EmployeesPage`, `WorkforceDashboardPage`, `WorkforceReportsPage`, `PayrollPage`, `RecruitmentPage`.
- **Hooks:** `useEmployees`, `useShifts`, `useWorkforce`.
- **Registry actions:** `hr.employee.create` (manager), `hr.leave.review` (high, manager), `recruitment.position.create` (manager). No dedicated HR edge functions — logic lives in hooks + registry.

### Planned vs actual (key correctness point)
`attendance` = actual clocked time → the basis for hours worked and payroll prep. `shifts`/`work_schedule` = plan. Over/under-staffing, conflicts and overtime are computed by comparing the two; proposals never auto-apply.

## System-verification / QA baseline (honest)
| Area | Status | Evidence |
|---|---|---|
| Dev server | **PASS** | `curl localhost:8080` → 200 (2026-10-18), Vite PID 46087 (other agent's) |
| Credential-free Playwright surface | **PASS (prior)** | 75/75 green earlier this session (public-smoke, access-control, auth-forms, keyboard-nav, resilience-i18n); not re-run this iteration |
| Tenant-isolation (integration) | **BLOCKED / NOT_TESTED** | ran `src/test/tenant-isolation.integration.test.ts` → **2 skipped**: self-skips unless `SUPABASE_SERVICE_ROLE_KEY` is set (it writes to real Supabase). Running it needs a service-role key against a non-prod project — a privileged write, not done without authorization (HR_QA_DECISIONS QA-1) |
| Staffing-gap detector (HR agent) | **PASS** | `src/mastra/agents/hr/staffing-gaps.ts` — 5/5 unit tests, typecheck clean (platform commit `812f9c1`) |
| Authenticated workflows (`authed-smoke`, `crm-crud`, `cross-tenant`, `sales-flow`) | **BLOCKED** | require a login session; "Confirm email" is ON and no safe test accounts exist (see HR_QA_DECISIONS #QA-1) |
| Propose-only bridge (agent→tool→proposal) | **PASS** | 7/7 unit tests on platform branch (`316e867`) |
| Agent→tool→approval→DB→UI full chain | **BLOCKED** | needs a running agent + a real session + the DB executor; blocked on auth test accounts (QA-1). NOT simulated — not reported as PASS. |
| No-model / no-integration / no-permission cases | **PASS** | `src/test/system-verification.test.ts` — unknown action rejected, OFF proposes nothing, failing transport propagates (no false success), idempotency keys stable on re-run, empty-input safety across CRM/finance/HR. 7/7 (platform commit `bfec1d3`). |
| Agent platform unit+integration suite | **PASS** | 91/91 across 19 files (bridge + CRM 48 + finance 15 + marketing 16 + HR 5 + system 7), typecheck clean, 2026-10-19 |

## Done
- **Iteration 2** — staffing-gap detector (platform commit `812f9c1`): `src/mastra/agents/hr/staffing-gaps.ts` + test (**5/5 passing**, typecheck clean). Detects unassigned shifts (under-staffing), double-booked employees, and shifts during approved leave, from real `shifts`+`leave_requests` fields. Reports PLANNED hours/employee with an explicit data-quality flag (actual hours unavailable). Proposes `tasks.create` conflict-resolution DRAFTs via the bridge; never payroll, never roster-apply. No individual wellbeing/burnout inference.
- Ran the tenant-isolation integration test → skipped (needs service-role key). Documented BLOCKED.

- **Iteration 3** — system-verification negative-path suite (platform commit `bfec1d3`): unknown action rejected, OFF proposes nothing, failing transport propagates (no false success), idempotency stable on re-run, empty-input safety across families. 7/7; full agent platform suite **91/91**; typecheck clean. The live agent→approval→DB→UI chain and cross-tenant persistence are NOT simulated — held BLOCKED, not a false PASS.

## Overall verifiable status
- **PASS** (no auth needed): agent platform suite 91/91 (bridge invariants, negative paths, all four department agents' propose-only logic), typecheck clean, `npm run build` green (earlier this session), localhost 200.
- **BLOCKED** (needs owner input, never faked): authenticated Playwright workflows (lead→deal→kunde→faktura, marketing→lead, medarbejder→vagt→opgave, agent→handling), tenant-isolation integration test, agent→approval→DB→UI persistence → all need safe auth test accounts (QA-1). `crm.lead.update` action (#10). Actual-time table for payroll-from-actual-hours (HR-4). Live AI/image creds (#1/#2/#8). Live accounting push (FO-1). New marketing schema (#7).

**Not all verifiable conditions are PASS → not reporting completion.** Everything achievable without owner-gated inputs is green and tested; the rest is explicitly BLOCKED and documented, with nothing shown as false success.

## Next action (iteration 4)
Hold for QA-1 (safe auth test accounts). When provided: run `authed-smoke`, `crm-crud`, `cross-tenant`, `sales-flow` Playwright specs + the tenant-isolation integration test against localhost with disposable data, and capture evidence/screenshots. Until then, no new runtime surface; optionally extend negative-path coverage (retry/replay semantics) at the unit level.

## This iteration — evidence
Mapping + baseline only, read-only. No code, no DB writes, no external calls, no payroll. Worktree `feature/hr-qa-agents` created off `eeaa028`; this file + `HR_QA_DECISIONS.md` are the only changes. `localhost:8080` untouched (verified 200).
