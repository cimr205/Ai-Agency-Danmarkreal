# AI Agency Danmark — Remediation Progress

Tracks the 35-phase remediation master prompt. This is a genuinely
multi-week scope; this document exists so work can continue accurately
across sessions instead of re-auditing from scratch each time.

Format: `[x]` done and verified live, `[~]` partially done, `[ ]` not started.

---

## PHASE 0 — Production source of truth
[x] **P0-001** Identify production repo/Supabase/frontend
Problem: Audit named two Supabase projects, unclear which is real.
Root cause: `supabase/config.toml` had a stale `project_id` from an earlier Lovable-export stage.
Files: `docs/production-architecture.md`, `supabase/config.toml`
Migration: none (config only)
Tests: verified via `.env`, Vercel prod env, `supabase projects list` (only 3 projects visible, `inyrwsygghdjhmqejgwk` not among them, `vbxlpxhvojlaisxcipyh` linked+healthy)
Browser verified: n/a (infra check)
**Open finding, not resolved:** `main` branch is likely behind live production (deploys ship via direct `vercel --prod`, not git-triggered). Needs a user decision — see the doc.

## PHASE 1 — Tenant model / roles
[x] **P0-002** `user_roles` had no `company_id` — real privilege-escalation gap
Root cause: `is_company_admin()`/`has_role()` checked "has this role ANYWHERE", not "for this company". A user who left Company A (as admin) and joined Company B (as employee) would still pass admin checks in B.
Files: migrations 20260903000007/08/09, `_shared/ai/context/workspace-context.ts`, `ai-operating-manager/index.ts`, `ai-message/index.ts`
Migration: additive (nullable → backfill → verify → conditional NOT NULL), company-scoped unique index, dropped stale constraint, rewrote `has_role`/`is_company_admin`, fixed 4 downstream functions broken by the constraint change (self-caught regression)
Tests: verified live via direct SQL — 3 legitimate orphans (dead QA accounts) correctly left nullable, functions verified to reference company_id, no stale constraint references remain
Browser verified: not yet (needs a real signup/invite/join walkthrough — see FLOW 1/3 in Fase "E2E tests" below)

[x] **P0-003** `admin-data` — platform-wide data dump gated only by a shared string code
Root cause: no per-user auth at all; any authenticated app user who obtained the code could read every company's data or disable any company.
Files: `supabase/functions/admin-data/index.ts`
Tests: verified live (401 without auth token)
Browser verified: not yet — need to confirm the real AdminOverview UI still works for an actual system_admin

[ ] **P0-004** RLS cross-tenant test suite (Company A cannot read/write Company B records) — not yet built. Existing RLS policies were spot-checked (found correctly written for the tables inspected this pass: `user_roles`, `invitations`, `usage_quotas`) but a systematic automated cross-tenant test across ALL tables has not been done.

[ ] **P0-005** Full sweep of "every tenant-owned table has company_id NOT NULL + FK" — not done. Spot-checked `user_roles` (fixed). The audit's full list (leads/contacts/customers/deals/tasks/quotes/invoices/payments/employees/email_accounts/integrations/email_send_log/suppression/calendar_connections/workflows/activity_logs/time_tracking/leave_requests/campaigns) needs a systematic pass — most of these already showed `company_id` present when spot-checked earlier this session (customers, deals, tasks, invoices, calendar_events, crm_activities), but this hasn't been exhaustively verified table-by-table with FK/constraint checks.

## PHASE 2 — Auth / invitations
[~] **Found: a real invitation system already exists**, not the audit's assumed "company code only" state. `invitations` table (company_id, email, role, token, expires_at, status, accepted_at) + `accept_invitation()` RPC + `InvitationsPage.tsx` — genuinely solid (email verification, expiry, single-company-membership check, sensible RLS).
[ ] **Real gap confirmed:** `invitations.token` is stored as **plaintext**, not a hash — spec explicitly requires hashing. Not yet fixed.
[ ] **Real gap confirmed:** the company-activation-code join flow (`join_company_by_code`) still exists **in parallel** with invitations — anyone with a company's activation code can self-join as 'employee', bypassing admin approval entirely. Fixed the code-path's regression (P0-002 fallout) but did not remove/gate the flow itself — that's a product decision (keep as a secondary path with stronger review, or remove) worth confirming with the user rather than silently deleting a working feature.

## PHASE 3 — OAuth secret security
[ ] Not yet audited this pass. Known from earlier session work: `email_accounts`/`integrations` store tokens server-side, never returned to frontend in the paths touched this session (Gmail OAuth, Composio). A full sweep of every provider adapter for direct token exposure has not been done.

## PHASE 4 — Integration core / capability layer
[x] Already substantially built this session (separate from this remediation pass): `CapabilityRegistry`, `IntegrationProvider` (native/composio), `ConnectionResolver`, real `email.send`/`files.search` capabilities — see prior commits on this branch (AI Action Engine work). Not re-verified as part of THIS remediation pass, but functionally addresses Fase 4's architecture ask.
[ ] Truthful multi-state connection status (`connected/expired/revoked/error/syncing/disconnected`, not just a bool) — not yet implemented. Current `integrations.status` is a plain text field without a real health-check-driven state machine.
[ ] Integration Center UI (categorized, COMING_SOON for non-functional providers) — partially exists (Connected Apps page, cleaned up earlier this session to remove decorative non-functional entries), not rebuilt to the full spec.

## PHASE 5-6 — Email / CRM domain model
[x] Gmail↔Composio unification (email.send works regardless of which was connected) — done earlier this session, verified live.
[ ] Everything else in Fase 5/6 (canonical EmailService, Smart Inbox connect-gate polish beyond what exists, CRM lead↔customer↔deal relation work beyond the existing record_type model, normalization/dedup) — not started this pass.

## PHASE 7-33 — Not started this pass
Deals detail route, quote→invoice→payment chain, invoice numbering safety, Meta Ads wizard, Lead Generation validation, time tracking (checked — already correctly manual, no auto-start, no midnight fabrication found), leave approval, employees/departments, recruitment, payroll, i18n, navigation performance, Operating Manager sizing, dashboard fake-data removal, error architecture, responsive UI, onboarding, notifications, audit log, global search, GDPR controls, performance/indexes, unsaved-changes guards, empty states, and the FASE 33 "test the untested" list — **none started this pass**. Each is a real, separate, non-trivial piece of work per the master prompt's own scope.

## E2E test flows (FLOW 1-8)
Not built this pass. Recommended next: FLOW 4 (cross-tenant rejection) and FLOW 1 (signup→company→invite) are the highest-value next tests given P0-002/003 just changed exactly that code path.

---

## Why this pass stopped here

This master prompt is, by its own acceptance criteria, a multi-week
production remediation covering 35 phases — quotes/invoices/payments,
Meta Ads, HR/payroll, i18n, navigation performance, and more, each a
real standalone project. This pass prioritized the P0 items with the
highest real security/correctness risk (tenant/role privilege
escalation, an unauthenticated platform-wide data-dump endpoint) and
fixed a regression it introduced in itself before moving on, rather
than touching a large number of files shallowly across all 35 phases
without adequate verification. Continuing this work should pick up
directly from the `[ ]`/`[~]` items above, in the priority order the
master prompt itself specifies (P0 before P1 before P2).
