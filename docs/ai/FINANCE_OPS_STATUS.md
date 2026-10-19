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

## Done
- **Iteration 3** — deadline monitor + work→invoice-basis preparer (platform commit `5596c9f`): `src/mastra/agents/finance/deadline-monitor.ts` + test (**6/6 passing**, typecheck clean). Read-only over real `tasks` (due_date/status/completed_at/deal_id): overdue + due-soon detection, and grouping of completed deal-linked work into a per-deal invoice basis (no amounts invented). Proposes `tasks.create` reschedule/review DRAFTs — never reschedules automatically, never issues an invoice (invoice.create stays a separate human-approved step), never contacts a customer.
  - Note: staffing conflicts are covered by the HR agent's `staffing-gaps` module (shifts+leave); not duplicated here.

## Finance/Ops capability coverage so far (all propose-only, tested)
overdue-invoice detector + dunning drafts + cashflow projection · deadline monitor + work→invoice-basis preparer.

- **Iteration 4** — revenue analysis + payment reconciliation (platform commit `86f84c1`): `src/mastra/agents/finance/revenue-analysis.ts` + test (**4/4 passing**; full finance suite **15/15**; typecheck clean). Recognizes revenue from real `payments` (paid, not reversed), grouped by month, reversed amounts reported separately; reconciles each invoice (fully/partially/unpaid/overpaid) and proposes `tasks.create` review DRAFTs for discrepancies. No payment taken/reversed.
  - Note on KONKURRENCE: competitive pricing comparison was built by the **marketing** agent (`competitor-analysis`, source-tagged, price changes stay proposals). Not duplicated here to avoid a parallel implementation.

## Finance/Ops capability coverage so far (all propose-only, tested, 15 unit tests)
overdue-invoice detector + dunning + cashflow projection · deadline monitor + work→invoice-basis · revenue analysis + payment reconciliation.

- **Iteration 5** — process-optimization metrics (platform commit `2b88892`): `src/mastra/agents/finance/process-metrics.ts` + test (**4/4 passing**, typecheck clean). Computes invoice lifecycle cycle times from real timestamps (created→issued, issued→paid), flags slow-payment outliers above both an absolute floor and avg*multiple (grounded, no fabricated benchmarks, honest on empty input), proposes `tasks.create` process-review DRAFTs. Read-only; no payment taken/changed.

## Finance/Ops capability coverage (all propose-only, tested, 19 unit tests) — buildable HOVEDMÅL complete
overdue-invoice detector + dunning + cashflow projection · deadline monitor + work→invoice-basis · revenue analysis + payment reconciliation · process-optimization metrics. (Staffing covered by HR's staffing-gaps; competitive pricing by marketing's competitor-analysis — not duplicated.)

## Status
Finance/Ops HOVEDMÅL are functionally complete at the agent-ownable layer. Everything routes through the propose-only Action Registry bridge; no payments/transfers/sends/accounting-pushes; no fabricated numbers. Remaining items are owner-gated only, documented, never faked:
- **FO-1** — live e-conomic/Dinero push needs a connected tenant + sandbox creds (real `push_invoice`/`push_customer` stay NOT_TESTED).
- **FO-2/FO-3** — automation level for invoice/dunning drafts + customer messages.
- Payment capture / Stripe — money-moving, owner/approve only (never in tests).
- Full task→plan→execute→invoice→payment chain end-to-end needs auth test accounts (QA-1, shared).

Re-running identical work each loop fire adds no value, so the **finance/ops loop is being stopped** (job `3b8c289e`). Restart `/loop 2h MASTERPROMPT 4 …` when a blocker is lifted (e.g. a connected accounting tenant), and resume with exactly that work. No low-value churn.

## This iteration — evidence
Mapping only, read-only. No code, no DB writes, no external calls, no payments/sends/pushes. Worktree `feature/finance-ops-agents` created off `eeaa028`; this file + `FINANCE_OPS_DECISIONS.md` are the only changes. `localhost:8080` untouched.
