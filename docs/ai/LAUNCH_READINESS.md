# AI Agency Danmark — Launch Readiness Matrix

**Date:** 2026-10-21 · **Branch:** `chore/mastra-install` · **Test project:** `users` (`upqzzkdqlaqzgprufzrf`, non-prod)
**Scope:** Mastra AI Business OS (agents → Action Registry → DB) + its frontend. Production never touched; no push/merge/deploy beyond the owner-authorized test-only edge-function deploy.

## Executive verdict: **NOT LAUNCH_READY yet**

The **backend pipeline and authentication are verified end-to-end** against an isolated test project, and the **frontend authenticates + renders** against it. B2/B3 migration recovery and B4 lead-update registry work are complete within their documented scopes. Remaining gaps include the production model for complex tasks, marketing persistence, HR attendance, deeper UI verification, and current typecheck errors. Production-schema fidelity remains unverified. Backend readiness ≠ product readiness.

## Matrix

### ✅ PASS (verified with evidence)
| Area | Evidence |
|---|---|
| Mastra platform + unit/integration suite | B4 rerun: 224 passed / 2 skipped; build ✓. Current typecheck fails in five untouched locations; see `B4_LEAD_UPDATE_VERIFICATION.md`. |
| **Backend authenticated E2E (2 tenants)** | **12/12 Playwright specs** live vs test DB |
| proposal → approval → execution → **DB persistence** → audit | spec 01 + direct smoke (status `completed`, `ai_action_audit` event_type) |
| **Cross-tenant isolation** | B cannot approve A's action → **404**; B cannot read A's rows → **RLS empty**; A/B each see only own |
| **Role authorization** | employee approving a manager-only action → **403** |
| **Approval boundaries** (OFF/DRAFT_APPROVAL/AUTO) | DRAFT awaits approval; high-risk never auto-executes under OFF/AUTO |
| **Idempotency / duplicate-execution / retry** | same key → no duplicate; re-approve → `idempotentReplay:true` |
| CRM / Marketing / Finance / HR flows | propose→approve→persist (drafts only; no real sends/payments) |
| **Frontend auth login + dashboard** | spec 07 — real user logs in via Supabase auth on isolated `:8091` (test env), reaches `/app/dashboard` |
| **Migration reproducibility** | all **66/66** migrations apply cleanly to a fresh schema |
| Defect fix: invalid-SQL apostrophe migration | fixed in `20260912000001` (`customer''s`) + regression test `migrations-lint.test.ts` |
| Model router (complexity-based; 2B behind flag; complex→BLOCKED not downgraded) | 14 router tests; live routing verified |
| Local dev inference (qwen3.5:2b via Ollama) | real inference verified (dev only) |

### 🚫 BLOCKED (owner input required)
| Blocker | Detail |
|---|---|
| B1 Complex production AI model | see below |
| ~~B2 Migration completeness (15 missing tables)~~ | ✅ **RESOLVED** 2026-10-21 — see below + `B2_SCHEMA_RECOVERY.md` |
| ~~B3 types.ts drift~~ | ✅ **RESOLVED** (user_roles.company_id removed; verified non-breaking) |
| ~~B4 crm.lead.update action~~ | ✅ **RESOLVED** on test project — `B4_LEAD_UPDATE_VERIFICATION.md` |
| B5 Marketing persistence | see below |
| B6 HR attendance / actual hours | see below |

### ⏳ NOT_TESTED
| Area | Why |
|---|---|
| Deeper UI flows: AI chat & agent routing, proposal/approval **UI**, UI-driven CRM/Mkt/Fin/HR, error/loading states | login+dashboard verified via UI; deeper UI journeys need additional Playwright specs against `:8091`. Backend equivalents are PASS at the API layer. |

### ❌ FAIL
None open — the one defect found (apostrophe migration) is fixed and regression-guarded.

---

## Blocker detail (issue / impact / solution / owner input / evidence / next action)

### B1 — No production-grade AI model for complex tasks
- **Issue:** Only the local `qwen3.5:2b` (dev) is configured. The model router correctly returns **BLOCKED** for `complex` tasks (never downgrades to 2B).
- **Customer impact:** Complex agent reasoning (deal strategy, campaign strategy, forecasting) is unavailable — those features can't run.
- **Solution:** Configure a `standard`/`advanced` model via env (`MASTRA_STANDARD_LLM_*` / `MASTRA_ADVANCED_LLM_*`) — a hosted OSS 14B–70B or gateway. See `MASTRA_MODEL_ROUTER.md`.
- **Owner input:** choose a provider + budget; supply endpoint/key.
- **Evidence:** `resolveModel("complex")` → `blocked` live; router tests.
- **Next action:** once endpoint provided, re-run the department live battery at `complex`.

### B2 — 15 production tables had no migration → ✅ RESOLVED (reproducibility), residual = production fidelity
- **Original issue:** 15 tables (`ai_conversations, ai_messages, ai_execution_runs, ai_execution_steps, call_sessions, capability_usage, integration_dna, integration_opportunities, phone_identities, telephony_connections, telnyx_config, telnyx_credentials, telnyx_webhook_events, workspace_ai_preferences, workspace_capabilities`) existed in production but had **no create-table in any migration**.
- **Root cause (corrected):** orphaned production tables created outside migration history; **not referenced by committed app code or edge functions** (only in generated `types.ts`). My earlier "AI chat breaks on fresh deploy" was **overstated** — the committed app doesn't query them.
- **Resolution:** new forward-only migration `20261014000000_reconstruct_orphaned_production_tables.sql` reconstructs all 15 (source-based from `types.ts`; production metadata inaccessible). Fresh build now **67/67, all 117 tables present (0 missing)**; RLS on 15/15; tenant policies on 13/13; live cross-tenant RLS on `ai_conversations` PASS. Regression test `reconstructed-schema.test.ts` added.
- **Residual (owner input):** reconstructed DDL is functionally correct + tenant-safe but **not guaranteed byte-identical to production** (exact types/defaults/CHECK/indexes/triggers/original-RLS unverified). Provide a `pg_dump --schema-only` of the 15 tables (or Management-API query access to prod) to finalize. `ai_execution_steps`/`telnyx_webhook_events` tenant scoping (deny-all) to confirm. See `B2_SCHEMA_RECOVERY.md`.

### B3 — `types.ts` drift (`user_roles.company_id`) → ✅ RESOLVED
- **Issue:** committed types claimed `user_roles.company_id`; real schema + app usage have none.
- **Resolution:** surgically removed it from `types.ts`. Verified **non-breaking** — neither AuthContext (`select role, can_grant_permissions`) nor AdminUsers (`select user_id, role`) uses it; full `tsc --noEmit` = 0 errors.
- **Note:** full regeneration of `types.ts` deferred until B2 residual (production dump) so the 15 tables keep production-accurate types.

### B4 — `crm.lead.update` → ✅ RESOLVED (registry + test-project E2E)
- **Resolution:** member-role, medium-risk action with mandatory approval, five allowed update fields, explicit tenant and lead-type filters, before/after audit, and optimistic conflict detection.
- **Evidence:** all five tests in `e2e/tests/08-crm-lead-update.spec.ts` pass against the isolated test project, including persistence, duplicate approval, foreign/missing/non-lead targets, validation, rejection, and readonly authorization.
- **Scope:** the canonical Action Registry uses `customers` rows with `record_type='lead'`. Agent workflows that read the separate `leads` table still require explicit ID reconciliation before adopting this action. Existing reply-review behavior is unchanged; production deployment is not performed.
- **Details:** `B4_LEAD_UPDATE_VERIFICATION.md` and `CRM_LEAD_UPDATE_ACTION_SPEC.md`.

### B5 — Marketing persistence
- **Issue:** Marketing agent outputs (drafts, analyses) aren't persisted to a dedicated schema (#7).
- **Customer impact:** marketing suggestions aren't durable/reviewable across sessions.
- **Solution:** add a marketing-content schema + migration; route via the bridge.
- **Owner input:** approve the new schema/migration.
- **Evidence:** `MARKETING_SCHEMA_PROPOSAL.md`.
- **Next action:** add migration + persistence action.

### B6 — HR attendance / actual hours
- **Issue:** No actual-time table (HR-4); only planned `shifts`. Payroll-from-actual is blocked.
- **Customer impact:** HR hours/payroll prep can't use real worked time.
- **Solution:** add an `attendance`/time-entries table + migration.
- **Owner input:** approve the schema.
- **Evidence:** `HR_QA_STATUS.md` (HR-4).
- **Next action:** add migration; wire staffing/payroll prep to actual hours.

---

## Critical path to LAUNCH_READY
1. ✅ ~~**B2** add the 15 missing migrations~~ — DONE (67/67 fresh; all 117 tables; RLS verified). Residual: production schema dump to confirm byte-fidelity.
2. ✅ ~~**B3** types drift~~ — DONE (user_roles.company_id removed, non-breaking).
3. **B1** configure a production model for complex tasks (owner: endpoint + budget).
4. ✅ **B4** registry lead.update complete; **B5–B6** marketing persistence and HR attendance remain open.
5. Extend UI E2E to the deeper flows (AI chat, proposal/approval UI).
6. B2 residual: `pg_dump --schema-only` of the 15 tables from production to finalize exact types/RLS fidelity.

**Do not declare LAUNCH_READY** until B1 (production model), B2 (complete migrations), and the deeper authenticated UI flows are verified. Backend + auth + frontend-login are PASS; the product is not yet complete.
