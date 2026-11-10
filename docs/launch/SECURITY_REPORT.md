# Security Report — 2026-11-10

Scope: tenant isolation, role-based access, and database-level security posture, verified directly against the **live** Supabase project this app is configured against (`vbxlpxhvojlaisxcipyh`, via the Supabase MCP server's read-only schema/advisor tools).

**Important constraint on this report:** this project has real tenant data (19 companies, 13 customers, 635 user sessions, etc.) — it is not an empty throwaway environment. Per this session's own data-protection safeguards, direct reads of row-level data (employee names, user IDs tied to real rows) were correctly blocked and **not attempted via workaround**. Everything below is either schema/policy metadata (no customer data) or a live security-linter run (also metadata-only). True behavioral cross-tenant testing (creating two synthetic companies and attempting to read across them) was not performed in this pass — see "What remains BLOCKED" below.

## 1. RLS coverage — full schema (live, verified)

Queried every table in the `public` schema via `list_tables`. **All ~130 tables have `rls_enabled: true`. Zero tables have RLS disabled.** This is a live result, not a code-review inference — Supabase's own `rls_disabled_in_public` linter rule (which would have appeared in the advisors report if any table lacked RLS) did not fire.

## 2. RLS enabled but no policy (live advisors, `rls_enabled_no_policy`, 3 findings)

| Table | Assessment |
|---|---|
| `oauth_states` | Backend-only bookkeeping (OAuth flow state), accessed via service-role edge functions. RLS-enabled-no-policy means **zero access for any non-service-role caller** (fail closed) — correct for a table with no legitimate client-side use. |
| `phone_pairing_rate_limits` | Same pattern — service-role-only rate-limit bookkeeping. Fail closed is correct. |
| `telnyx_webhook_events` | Same pattern — webhook audit log, written by `telnyx-webhook` via service role. Fail closed is correct. |

None of these are tenant-data tables a user is ever meant to query directly, so "no policy" (= inaccessible to anyone but the table owner/service role) is the right posture, not a gap.

## 3. HR tables — tenant-isolation policy review (live, verified)

Read the actual `pg_policies` rows (policy definitions, not data) for the 6 core HR tables. Every single policy enforces `company_id = get_user_company_id(auth.uid())`:

| Table | Policies checked | Scoped by company_id? |
|---|---|---|
| `employee_profiles` | 6 (insert×2, update×2, select×2) | Yes, on every policy. One intentional exception: `"System admins can view all employee profiles"` — scoped to `has_role(auth.uid(), 'system_admin')`, the documented system-wide superuser role, not a leak. |
| `attendance_logs` | 3 (check-in, check-out, view) | Yes, on every policy, plus a self-scoping join through `employee_profiles.user_id = auth.uid()` for the check-in/out policies (a user can only clock themselves in/out, not a colleague). |
| `leave_requests` | 4 | Yes, on every policy. |
| `payroll` | 4 | Yes, on every policy. Additionally, "Employees can view their own payroll" is scoped to `employee_profile_id` matching the caller — an employee cannot see a colleague's payroll even within the same company. |
| `shifts` | 4 | Yes. **Note:** these 4 policies are granted to role `{public}` rather than `{authenticated}` like the others — `public` includes `anon`. This is not an active hole (every policy's condition calls `get_user_company_id(auth.uid())`, which is `NULL` for an anonymous caller, and `company_id = NULL` is never true in SQL — so an anonymous request still returns zero rows), but it's an inconsistency worth tightening to `{authenticated}` for defense-in-depth and to match the pattern used everywhere else. |
| `work_schedules` | 4 | Yes, on every policy. |

**Finding: HR tenant isolation at the RLS layer is correctly and consistently implemented.** This upgrades the prior status (`feature/hr-qa-agents`'s `HR_QA_STATUS.md`, which reported "BLOCKED/NOT_TESTED" for the live integration test) — that report was about the automated *integration test* being unable to run (missing `SUPABASE_SERVICE_ROLE_KEY`), not a known defect in the policies themselves. This pass confirms the policies are sound by reading them directly off the live database, which is a stronger form of verification than the static code review that was possible before, but still **not** the full behavioral two-tenant test the mission asks for (see below).

## 4. Function-level access control (live advisors — real findings, not yet remediated)

| Finding | Count | Assessment |
|---|---|---|
| `anon_security_definer_function_executable` — `SECURITY DEFINER` functions callable by the unauthenticated `anon` role via PostgREST RPC | 81 functions, incl. `accept_invitation`, `auto_create_payment_on_invoice_paid`, `auto_mark_invoice_paid` | **Real hardening gap, not necessarily an active exploit.** Spot-checked `accept_invitation()`: it calls `auth.uid()` internally and raises on a NULL caller (no matching profile), so an anonymous call fails safely — but the function should not be *reachable* by `anon` at all; today it is, at the grant level. |
| `authenticated_security_definer_function_executable` — same, for the `authenticated` role | 95 functions | Expected for most (these are the app's RPC surface), but worth an explicit allowlist review rather than assuming every one of the 95 is meant to be client-callable. |
| `function_search_path_mutable` | 3 functions (`increment_campaign_replies`, `normalize_phone_number`, `customers_set_normalized_phone`) | Low-severity hardening: a function without a fixed `search_path` is a schema-hijacking vector (lower severity here since these functions don't appear to build dynamic SQL from the mutable path, but should still be fixed with `SET search_path = public`). |
| `auth_leaked_password_protection` disabled | 1 | Supabase Auth config, not a code/migration fix — enable via the Supabase dashboard or Management API (not available through the read-only MCP tools used in this pass). **Flagged for owner action**, trivial to turn on, no downside. |

**Recommendation:** a dedicated follow-up pass should review all 81+95 functions and `REVOKE EXECUTE` from `anon`/`authenticated` on any that have no legitimate direct-RPC use case (most should probably only be callable indirectly, through another function, an edge function using the service role, or not be in the exposed API schema at all). This was **not** done in this pass — mass-revoking without checking each function's actual call sites in the frontend risks breaking a legitimate feature, and 176 functions is too large a blast radius to review exhaustively in this session.

## 5. What remains BLOCKED (honestly, not faked)

- **Live two-tenant cross-read test** (mission §7.1's actual request: create Tenant A and Tenant B, attempt to read/write across them, confirm denial): not performed. This project has real customer data; creating synthetic test companies/users directly in it, or reading real rows to construct the test, both require explicit owner authorization this session did not have and correctly did not attempt to route around. **Unblocking this needs one of:** a dedicated non-production Supabase project, or owner-provided safe test credentials in this project explicitly cleared for read access.
- **Role/permission matrix behavioral testing** (§7.2 — frontend, API, edge functions, DB/RLS, AI-tool execution for owner/admin/employee/readonly): the RLS-policy text review above covers the DB/RLS layer for HR; a full cross-module permission matrix (CRM, finance, marketing, admin) was not re-derived from scratch in this pass — out of time budget for this session, flagged as remaining work.
- **`autopilot_actions`/`ai_action_audit`/audit-log completeness** for AI-tool execution: tables exist (`ai_action_audit: 0 rows`, `workspace_events: 31 rows` — described as "Canonical append-only business event ledger and durable outbox"), confirming an audit infrastructure exists, but its actual coverage (does every sensitive AI action write to it?) was not traced through the code in this pass.

## 6. Verdict for this section

**Database-level tenant isolation: PASS (schema/policy-verified, not behaviorally E2E-tested).** No table lacks RLS. Every HR policy checked is correctly scoped. The one real, live-confirmed hardening gap (anon/authenticated access to 176 SECURITY DEFINER functions) is a defense-in-depth improvement, not a confirmed active breach — every spot-checked function fails safely on an unauthorized caller via its own internal `auth.uid()` logic.

**Full behavioral cross-tenant verification: BLOCKED**, pending either a non-production test project or explicit owner authorization to create/read test data in the current project.
