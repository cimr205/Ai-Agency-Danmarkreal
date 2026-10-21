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
| CRM — Deals / Pipeline | **VERIFIED** | Deal linked to customer (`sales-flow`); **stage progression** discovery→proposal persists after refresh via `update_deal_stage` (`deal-pipeline.spec.ts`); "mark won" has a server/client business guard (`canMarkDealWon`) |
| CRM — Contacts | **N/A** | No separate contacts entity — contacts are `customers`/leads (shared table). The `/contacts` route is admin contact-form submissions, not a CRM entity |
| Finance — Quotes | **VERIFIED** | Lifecycle + illegal-transition guard (`sales-flow`, `finance-edge`) |
| Finance — Invoices | **VERIFIED** | Direct + quote-derived; status, search (`sales-flow`, `finance-edge`) |
| Finance — Payments | **VERIFIED** | Full/partial/overpayment/concurrency (`finance-edge`) |
| Finance — Integrity (VAT, protection) | **VERIFIED** | VAT math exact (8000+25%=10000, amount=subtotal+vat); a **paid invoice cannot be deleted** (`delete_draft_invoice` draft-only) (`finance-edge.spec.ts`) |
| Finance — Invoice PDF | **VERIFIED** | PDF downloads and carries invoice number + company + customer (`finance-edge.spec.ts`, jspdf text extracted from the download) |
| Finance — Overdue | **VERIFIED** (bug fixed) | Past-due unpaid invoices now surface as **Overdue** (badge/stat/tab) — previously invisible because the DB never sets `status='overdue'`; now derived from `due_date` at display time, matching the dashboard (`finance-edge.spec.ts`) |
| Work — Tasks | **VERIFIED** | `service-ops.spec.ts` — CRUD, assign, status, customer/lead/deal link, traceability |
| Work — Calendar | **VERIFIED** | Event create + persist; a scheduled task (due date) surfaces on the calendar — Customer→Task→Calendar link (`calendar.spec.ts`) |
| Email — viewer (XSS) | **VERIFIED** | `email-xss.spec.ts` — sandboxed iframe blocks script/parent/session theft |
| Email — inbox/threads/send | **BLOCKED** | Needs connected sandbox mailbox; no real sends in QA |
| AI-assisted action (follow-up) | **VERIFIED** | `ai-assist-pipeline.spec.ts`, `lead-ai-assist.spec.ts` — propose→approve→execute-once→audit, tenant-isolated. Live-model *analysis* **BLOCKED** (BLOCKER-AI-001) |
| Settings — Invitations | **VERIFIED** | `invitations.spec.ts` — secure one-time token, no token/hash exposed |
| Admin — Users/Employees | **PARTIAL** | Compiles + green type-check; system_admin-only, not reachable by the test tenant (no fixture) |
| Settings — Company details | **NOT TESTED (UI)** | `handleSave` is a standard RLS-scoped `companies` update; UI inputs are unlabeled + a global search box shares the textbox role, so a robust UI edit test was deferred. Data path/RLS covered by cross-tenant tests |
| Settings — Subscription | **NOT TESTED** | No real subscription transactions in QA |
| Onboarding / first-run (new company) | **BLOCKED** | Signup yields no session (Supabase "Confirm email" ON) → a brand-new company can't be provisioned in automated QA. Existing-tenant surfaces verified elsewhere |
| HR — Employees / Schedule / Attendance / Time / Leave | **NOT TESTED / BLOCKED** | Multi-employee role separation needs ≥2 confirmed accounts (BLOCKED-signup). Single-user surfaces not yet exercised |
| HR — Payroll / legal (DK) | **BLOCKED** | Must NOT be represented as production-ready; calculations/permissions/legal assumptions unverified |
| Marketing (Meta Ads etc.) | **NOT TESTED** | No real ad spend in QA |

---

## Known blockers (reported, not silently resolved)
- **BLOCKED-signup**: Supabase "Confirm email" is ON → automated signup yields no session, so multi-user role tests and first-run signup can't be driven end-to-end without an already-confirmed fixture.
- **BLOCKER-AI-001**: external AI provider returns 404 "configured model not found" → live-model *analysis text* unavailable (action pipeline unaffected). Out of scope for traditional-SaaS phase.

## Done since first draft (now VERIFIED)
- Invoice PDF content, overdue surface (bug fixed), paid-invoice delete protection, VAT math.
- Deal/pipeline stage progression; service-ops customer↔task traceability; calendar + task-on-calendar.
- Responsive smoke on **mobile (390×844)** and **tablet (768×1024)** for the core pages (`responsive-smoke.spec.ts`).

## Next priorities
1. **BLOCKED-signup** (owner decision pending creds): drop a `SUPABASE_SERVICE_ROLE_KEY` into the gitignored `.env.local` for a test-only admin-provisioning script → unblocks HR multi-role (Workflow B) + new-company first-run (Workflow E).
2. HR schedule/attendance/time single-user surfaces (what's testable without a 2nd account).
3. Full-flow mobile (not just smoke); Settings/Company UI edit; email inbox with a sandbox mailbox.
