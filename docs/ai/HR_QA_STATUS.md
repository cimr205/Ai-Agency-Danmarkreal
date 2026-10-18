# HR Agents & System Verification (QA) — Status

**Owner:** HR/QA loop (MASTERPROMPT 5) · **Worktree:** `/Users/macbookpro/hr-qa-worktree` · **Branch:** `feature/hr-qa-agents` (based on `feature/frontend-operating-system` @ `eeaa028`)
**Depends on:** Mastra platform (`chore/mastra-install`) + propose-only Action Registry bridge (`316e867`).
**Coordination:** reads `MASTER_STATE.md`, does NOT write it. Owner questions in local `HR_QA_DECISIONS.md`.
**Last updated:** 2026-10-18 (iteration 2 — staffing-gap detector built+tested; table inventory corrected; tenant-isolation test run)

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
| Agent→tool→approval→DB→UI full chain | **NOT_TESTED** | needs a running Mastra agent + a session; blocked on auth + model creds |
| No-model / no-integration / no-permission cases | **NOT_TESTED** | to be added as negative tests (must never show false success) |

## Done
- **Iteration 2** — staffing-gap detector (platform commit `812f9c1`): `src/mastra/agents/hr/staffing-gaps.ts` + test (**5/5 passing**, typecheck clean). Detects unassigned shifts (under-staffing), double-booked employees, and shifts during approved leave, from real `shifts`+`leave_requests` fields. Reports PLANNED hours/employee with an explicit data-quality flag (actual hours unavailable). Proposes `tasks.create` conflict-resolution DRAFTs via the bridge; never payroll, never roster-apply. No individual wellbeing/burnout inference.
- Ran the tenant-isolation integration test → skipped (needs service-role key). Documented BLOCKED.

## Next action (iteration 3)
Negative-path verification (must never show false success): add tests proving that (a) an unknown action is rejected by the bridge, (b) OFF mode proposes nothing, (c) a high-risk action is never auto-approved under AUTO — as a consolidated "no-permission / no-capability" suite across the agents. Plus: when safe auth test accounts are provided (QA-1), run the authenticated Playwright workflows (`authed-smoke`, `crm-crud`, `cross-tenant`, `sales-flow`) and the agent→approval→DB→UI chain.

## This iteration — evidence
Mapping + baseline only, read-only. No code, no DB writes, no external calls, no payroll. Worktree `feature/hr-qa-agents` created off `eeaa028`; this file + `HR_QA_DECISIONS.md` are the only changes. `localhost:8080` untouched (verified 200).
