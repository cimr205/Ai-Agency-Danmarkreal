# Finance & Operations Agents — Status

**Owner:** Finance/Ops loop (MASTERPROMPT 4) · **Worktree:** `/Users/macbookpro/finance-ops-worktree` · **Branch:** `feature/finance-ops-agents` (based on `feature/frontend-operating-system` @ `eeaa028`)
**Depends on:** the Mastra platform (`chore/mastra-install`) + propose-only Action Registry bridge (commit `316e867`).
**Coordination:** reads `MASTER_STATE.md` but does NOT write it (coordinator owns it). Owner questions go in the local `FINANCE_OPS_DECISIONS.md` to avoid concurrent-write conflicts on the shared `OWNER_DECISIONS.md`.
**Last updated:** 2026-10-18 (iteration 1 — function/data mapping; no code written)

## Hard rules
- Every write via the shared Action Registry (`ai-operating-manager`): server-side auth, RLS, idempotency, audit.
- No real transfers, payments, invoice sends or accounting pushes in tests (mocks/sandbox only).
- Payments, customer contact, pricing and financial changes are high-sensitivity → `approve`. Price changes stay proposals until a separate owner decision.
- No push, no deploy. Don't touch other agents' files/processes.

## Inventory (verified read-only, 2026-10-18)

### Operations surface
- **Pages:** `work/TasksPage`, `work/CalendarPage`, `work/InboxPage`; HR `WorkSchedulePage`, `TimeTrackingPage`, `AttendancePage`, `LeavePage`, `EmployeesPage`, `WorkforceDashboardPage`, `WorkforceReportsPage`, `PayrollPage`, `RecruitmentPage`.
- **Hooks:** `useTasks`, `useShifts`, `useWorkforce`, `useEmployees`.
- **Tables:** `tasks`, `shifts`, `work_schedule`, `attendance`, `leave_requests`.

### Finance surface
- **Pages:** `finance/InvoicesPage`, `finance/QuotesPage`, `finance/PaymentsPage`.
- **Hooks:** `useFinance`.
- **Tables:** `invoices`, `quotes`, `payments`, plus `economic_*` and `dinero_*`.
- **Checkout/subscription fns:** `create-checkout`, `create-invoice-checkout-session`, `check-subscription`, `customer-portal`, `stripe-webhook` (Stripe billing — REAL, money-moving → `approve`/owner only).

### Accounting integrations — REAL and bidirectional
| Provider | Functions | Direction |
|---|---|---|
| **e-conomic** | `economic-oauth-start/callback`, `economic-sync`, `accounting-disconnect` | `economic-sync` supports **`push_customer`** and references invoice push (POST to e-conomic). |
| **Dinero** | `dinero-oauth-start/callback`, `dinero-sync` | supports **`push_customer`** and **`push_invoice`** (POST to Dinero). |
→ Real external writes. Gated on valid OAuth connection + rights per tenant. **BLOCKED until a tenant has connected the provider** (no creds available in this environment) — mark NOT_TESTED for live push; mockable in tests.

### Action Registry coverage (reuse, do not recreate)
`tasks.create` (low), `tasks.complete` (medium), `calendar.event.create/update` (medium), `crm.deal.move_stage` (high), `crm.customer.*`, **`invoice.create` (high, draft only)**. The accounting push and payment capture are `integration`/money-moving → always `approve`.

## Status table
| Capability | Status | Note |
|---|---|---|
| Ops data model (tasks/shifts/schedule/attendance/leave) | PASS (exists) | read-only verified |
| Finance data model (invoices/quotes/payments) | PASS (exists) | read-only verified |
| e-conomic / Dinero push | BLOCKED / NOT_TESTED | real code; no connected tenant/creds here |
| Stripe billing | PASS (exists), money-moving | owner/approve only; never in tests |
| task→schedule→execution→invoice→payment chain | NOT_TESTED | mappable to existing actions; to be exercised with mocks |
| Mastra finance/ops agents | NOT STARTED | this iteration is mapping only |

## Done
- **Iteration 2** — overdue-invoice detector + dunning drafts + cashflow projection (platform commit `99be513`): `src/mastra/agents/finance/overdue-invoices.ts` + test (**5/5 passing**, typecheck clean). Read-only over real invoice fields (amount/status/due_date/paid_at): overdue set (most overdue first), deterministic aging buckets (current / 1–30 / 31–60 / 60+), outstanding + overdue totals. Proposes a `tasks.create` reminder DRAFT per overdue invoice via the bridge — **no email sent, no payment taken, no accounting push**. Settled/paid invoices excluded.

## Next action (iteration 3) — operations vertical, fully mockable
**Staffing/deadline monitor**: from (mocked) `tasks` + `shifts`/`work_schedule` + `attendance`, detect overdue tasks and calendar conflicts, and propose `tasks.create`/`calendar.event.update` DRAFTs for rescheduling — propose-only, idempotency-keyed, nothing auto-applied. Plus a read-only "work completed → invoice basis" preparer that links verified-done tasks to an `invoice.create` DRAFT (never auto-issued). Unit tests + typecheck.

## This iteration — evidence
Mapping only, read-only. No code, no DB writes, no external calls, no payments/sends/pushes. Worktree `feature/finance-ops-agents` created off `eeaa028`; this file + `FINANCE_OPS_DECISIONS.md` are the only changes. `localhost:8080` untouched.
