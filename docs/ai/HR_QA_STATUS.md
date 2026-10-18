# HR Agents & System Verification (QA) — Status

**Owner:** HR/QA loop (MASTERPROMPT 5) · **Worktree:** `/Users/macbookpro/hr-qa-worktree` · **Branch:** `feature/hr-qa-agents` (based on `feature/frontend-operating-system` @ `eeaa028`)
**Depends on:** Mastra platform (`chore/mastra-install`) + propose-only Action Registry bridge (`316e867`).
**Coordination:** reads `MASTER_STATE.md`, does NOT write it. Owner questions in local `HR_QA_DECISIONS.md`.
**Last updated:** 2026-10-18 (iteration 1 — HR mapping + honest QA baseline; no code written)

## Hard rules
- Work hours from **actual registration** (`attendance`), not just planned `shifts`. No automatic payroll payout; payroll prep is verified against real data only.
- **No individual-level** wellbeing/health/burnout inference. Only aggregated, privacy-preserving operational metrics with explicit data-quality notes.
- Every write via Action Registry (auth/RLS/idempotency/audit). OFF/DRAFT_APPROVAL/AUTO. Never show false success.
- Respect all parallel agents; no overwrite/reset/stash/process-kill. No push/deploy.

## HR inventory (verified read-only, 2026-10-18)
- **Tables:** `employees`, `employee_profiles`, `attendance` (actual), `shifts` + `work_schedule` (planned), `leave_requests`, `payroll`, `recruitment`.
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
| Tenant-isolation (integration) | **NOT_TESTED this iteration** | `src/test/tenant-isolation.integration.test.ts` exists; to be run |
| Authenticated workflows (`authed-smoke`, `crm-crud`, `cross-tenant`, `sales-flow`) | **BLOCKED** | require a login session; "Confirm email" is ON and no safe test accounts exist (see HR_QA_DECISIONS #QA-1) |
| Propose-only bridge (agent→tool→proposal) | **PASS** | 7/7 unit tests on platform branch (`316e867`) |
| Agent→tool→approval→DB→UI full chain | **NOT_TESTED** | needs a running Mastra agent + a session; blocked on auth + model creds |
| No-model / no-integration / no-permission cases | **NOT_TESTED** | to be added as negative tests (must never show false success) |

## Next action (iteration 2) — first safe HR vertical, fully mockable
**Staffing-gap detector** (read-only, propose-only):
- Pure module: given (mocked) `shifts`/`work_schedule` + `attendance` + `leave_requests` + contract hours, compute per-day/role **over-staffing, under-staffing, conflicts and overtime** deterministically, with a data-quality flag when attendance is missing.
- Emits a `tasks.create` or `calendar.event.update` **draft proposal** (DRAFT_APPROVAL) via the propose-only bridge — never auto-applies a roster, never touches payroll.
- Unit tests: gap math, actual-vs-planned precedence, data-quality flagging, and that nothing writes/executes. Then typecheck.
- Parallel QA task: run `src/test/tenant-isolation.integration.test.ts` and add negative-path tests (no model / no permission → explicit failure, never false success).

## This iteration — evidence
Mapping + baseline only, read-only. No code, no DB writes, no external calls, no payroll. Worktree `feature/hr-qa-agents` created off `eeaa028`; this file + `HR_QA_DECISIONS.md` are the only changes. `localhost:8080` untouched (verified 200).
