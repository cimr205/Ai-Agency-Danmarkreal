# AI Agency Danmark — Product Readiness Matrix

_States: **VERIFIED** (real-browser/REST evidence) · **PARTIAL** (works, gaps noted) · **BROKEN** · **BLOCKED** (external dependency) · **NOT TESTED**. No readiness percentages — every VERIFIED points to a test._

**Branch:** `feature/frontend-operating-system` · **Last updated:** 2026-10-20 · **Gates:** `type-check` ✅ 0 errors · `build` ✅
Test tenants: **QA Tenant A** / **QA Tenant B** (isolated, synthetic data, no real side effects).

---

## End-to-end business workflows

| Workflow | State | Evidence | Notes |
|---|---|---|---|
| **A. Sales-to-cash** — Lead → Customer → Deal → Quote → Invoice → Payment | **VERIFIED** | `manual-sales-flow.spec.ts`, `sales-flow.spec.ts`, `finance-edge.spec.ts` | Atomic lead conversion (dedupe), quote draft→sent→accepted, quote→invoice, partial payment + remaining, overpayment/negative rejected, concurrent-payment exactly-once, persistence, cross-tenant isolation |
| **B. Service operations** — Customer → Task → Assignment → Schedule → Progress → Completion | **VERIFIED** | `service-ops.spec.ts` | Customer-linked task (`lead_id`→customers), assignee, due date, pending→in_progress→completed, `completed_at`, traceable on customer timeline, tenant-isolated. ⚠️ true multi-user role separation not exercised (see BLOCKED-signup) |
| **C. Employee operations** — Invite → Role → Schedule → Attendance → Time → Leave → Reporting | **PARTIAL** | `invitations.spec.ts` (invite create + one-time link + list); | Secure invitations VERIFIED. Schedule/attendance/time/leave/payroll **NOT TESTED** this phase |
| **D. Customer communication** — Email → thread → follow-up → task | **PARTIAL** | `email-xss.spec.ts` (sandbox), `lead-ai-assist.spec.ts` (follow-up) | Stored-XSS defense VERIFIED; follow-up task VERIFIED. Live Gmail connect/send **BLOCKED** (needs a connected sandbox mailbox; no real sends in QA) |
| **E. First-customer experience** — Signup → company → first customer → first action | **PARTIAL / BLOCKED** | — | Signup→session **BLOCKED** (Supabase "Confirm email" ON; no automated session). Existing-tenant flows verified elsewhere |

---

## Modules

| Module | State | Evidence / Notes |
|---|---|---|
| CRM — Leads | **VERIFIED** | `crm-crud.spec.ts` (create+persist), conversion in `manual-sales-flow` |
| CRM — Customers / Clients | **VERIFIED** | Customer detail timeline + ledger (`manual-sales-flow` history step), now incl. service tasks |
| CRM — Deals / Pipeline | **VERIFIED** | Deal linked to customer, stage transitions (`sales-flow`) |
| Finance — Quotes | **VERIFIED** | Lifecycle + illegal-transition guard (`sales-flow`, `finance-edge`) |
| Finance — Invoices | **VERIFIED** | Direct + quote-derived; status, search (`sales-flow`, `finance-edge`) |
| Finance — Payments | **VERIFIED** | Full/partial/overpayment/concurrency (`finance-edge`) |
| Finance — Invoice PDF | **NOT TESTED** | PDF content vs persisted totals not yet verified |
| Work — Tasks | **VERIFIED** | `service-ops.spec.ts` — CRUD, assign, status, customer/lead/deal link, traceability |
| Work — Calendar | **NOT TESTED** | — |
| Email — viewer (XSS) | **VERIFIED** | `email-xss.spec.ts` — sandboxed iframe blocks script/parent/session theft |
| Email — inbox/threads/send | **BLOCKED** | Needs connected sandbox mailbox; no real sends in QA |
| AI-assisted action (follow-up) | **VERIFIED** | `ai-assist-pipeline.spec.ts`, `lead-ai-assist.spec.ts` — propose→approve→execute-once→audit, tenant-isolated. Live-model *analysis* **BLOCKED** (BLOCKER-AI-001) |
| Settings — Invitations | **VERIFIED** | `invitations.spec.ts` — secure one-time token, no token/hash exposed |
| Admin — Users/Employees | **PARTIAL** | Compiles + green type-check; system_admin-only, not reachable by the test tenant (no fixture) |
| HR (attendance/time/leave/payroll) | **NOT TESTED** | Payroll must NOT be represented as production-ready |
| Marketing (Meta Ads etc.) | **NOT TESTED** | No real ad spend in QA |

---

## Known blockers (reported, not silently resolved)
- **BLOCKED-signup**: Supabase "Confirm email" is ON → automated signup yields no session, so multi-user role tests and first-run signup can't be driven end-to-end without an already-confirmed fixture.
- **BLOCKER-AI-001**: external AI provider returns 404 "configured model not found" → live-model *analysis text* unavailable (action pipeline unaffected). Out of scope for traditional-SaaS phase.

## Next priorities
1. Invoice PDF correctness (content vs persisted totals, VAT/currency).
2. Overdue-invoice surface + "paid invoices can't be edited/voided" guard (verify).
3. Responsive (tablet/mobile) passes for the verified workflows.
4. HR schedule/attendance/time workflow (Workflow C continuation).
