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

## Next action (iteration 2) — first safe vertical, fully mockable
**Overdue-invoice detector + dunning-draft proposer**, read-only + propose-only:
- A pure module: given (mocked) `invoices` rows (due_date, status, amount), return the overdue set and, for each, a **reminder draft** (no send) surfaced as a `tasks.create` or `email.send` **draft proposal** (DRAFT_APPROVAL) via the propose-only bridge.
- Deterministic aging buckets (0–30 / 31–60 / 60+). No real email, no payment action, no accounting push.
- Unit tests: aging math, that overdue is computed from real fields, and that nothing sends/executes. Then typecheck.
- Also drafts a read-only **cashflow projection** from `invoices`/`payments` (grounded in real aggregates, no fabricated metrics) — reported, not acted on.

## This iteration — evidence
Mapping only, read-only. No code, no DB writes, no external calls, no payments/sends/pushes. Worktree `feature/finance-ops-agents` created off `eeaa028`; this file + `FINANCE_OPS_DECISIONS.md` are the only changes. `localhost:8080` untouched.
