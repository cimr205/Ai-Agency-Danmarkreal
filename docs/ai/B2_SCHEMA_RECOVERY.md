# B2 — Schema Recovery: reconstruct orphaned production tables

**Date:** 2026-10-21 · **Branch:** `chore/mastra-install` · **Test project:** `users` (`upqzzkdqlaqzgprufzrf`, non-prod)
**Objective:** make every application table reproducible from version-controlled migrations (resolve B2 in `LAUNCH_READINESS.md`).

## Verdict: **B2 PASS** (for the stated criteria), with a scoped production-fidelity residual
- ✅ A clean database **can be recreated from migrations**: all **67** migrations apply fresh; **all 117 tables** referenced by `types.ts` are present (0 missing).
- ✅ **Required security policies verified**: RLS enabled on all 15 recovered tables; tenant policies on the 13 company-scoped ones; a **live cross-tenant RLS test on `ai_conversations` passed** (A→B = 0, B→A = 0, each sees own).
- ⚠️ **Residual (not production-faithful):** the 15 tables were reconstructed from `types.ts` because **production metadata was inaccessible** (account lacks query privilege on the prod project). Exact SQL types, DEFAULTs, CHECK constraints, indexes, triggers, and the **original** production RLS are **UNVERIFIED** and may differ from production. Needs a production schema dump to confirm.

## The 15 recovered objects
| Table | company_id | Tenant RLS |
|---|---|---|
| ai_conversations | ✅ | company policy |
| ai_messages | ✅ | company policy |
| ai_execution_runs | ✅ | company policy |
| ai_execution_steps | ❌ | RLS on, **deny-all** (flagged — scope via parent run) |
| call_sessions | ✅ | company policy |
| capability_usage | ✅ | company policy |
| integration_dna | ✅ | company policy |
| integration_opportunities | ✅ | company policy |
| phone_identities | ✅ | company policy |
| telephony_connections | ✅ | company policy |
| telnyx_config | ✅ | company policy |
| telnyx_credentials | ✅ | company policy |
| telnyx_webhook_events | ❌ | RLS on, **deny-all** (flagged) |
| workspace_ai_preferences | ✅ | company policy |
| workspace_capabilities | ✅ | company policy |

## Root cause
These 15 tables exist in production (they appear in the generated `types.ts`) but have **no `create table` in any of the 66 migrations**, and are **not referenced by any committed app hook, page, component, or edge function** — only by the generated `types.ts`. Root cause: they were created in production **outside migration history** (dashboard/manual or an uncommitted/in-progress feature branch), producing drift between production and the version-controlled schema. (Earlier "AI chat breaks on fresh deploy" claim was **overstated** — the committed app does not query these tables.)

## New migration
- `supabase/migrations/20261014000000_reconstruct_orphaned_production_tables.sql` (278 lines, forward-only). The 66 existing migrations and their history are **unchanged**. Dependency-safe order (parents before children: `ai_conversations` → `ai_messages`/`ai_execution_runs` → `ai_execution_steps`, etc.).
- Reconstruction method: parsed each table's `Row` (columns + nullability), `Insert` (optional ⇒ has default) and `Relationships` (FKs) from `types.ts`; mapped TS→SQL types heuristically (`string`→text / uuid for `*_id` / timestamptz for `*_at`; `number`→numeric; `Json`→jsonb; `string[]`→text[]); `id uuid primary key default gen_random_uuid()`; `created_at`/`updated_at default now()`; company_id FK → `companies(id) on delete cascade`; tenant RLS using the app's standard `get_user_company_id(auth.uid())`.
- Also fixed earlier (B2-adjacent): `20260912000001` apostrophe (B2 forensics) and removed the stale `user_roles.company_id` from `types.ts` (B3 — verified no app code uses it; both AuthContext and AdminUsers select only `role`/`user_id`).

## Schema comparison (evidence)
- Fresh build (reset `public` + apply all 67): **67/67 applied**, no errors.
- Tables in `types.ts` still missing from the fresh build: **0** (was 15).
- `pg_tables` recovered-set check: `tables_present=15, rls_enabled=15, company_policies=13`.

## RLS verification (evidence)
- Metadata: 15/15 tables `rowsecurity=true`; 13/13 company tables have a policy; 2 non-company tables deny-all.
- Live: seeded one `ai_conversations` row per tenant (service role), signed in as real users → `A_own=1, A_into_B=0, B_own=1, B_into_A=0` → **isolation PASS** (same `get_user_company_id` pattern proven for `leads` in QA-1 spec 02).

## Type generation (Phase 4)
- Did **NOT** blind-regenerate `types.ts` from the test project: the 15 tables there carry **heuristic** types (my reconstruction), so regeneration would *degrade* the production-accurate types committed for those tables and produce a massive diff. Instead, kept the accurate committed types and applied one **surgical, verified-safe** fix (removed `user_roles.company_id`). Full regeneration should run **after** a production-accurate schema dump reconciles the 15 tables.
- Breaking-change scan: no app code references `user_roles.company_id`; full `tsc --noEmit` = **0 errors**.

## Regression tests added
- `src/test/reconstructed-schema.test.ts` (4 tests): migration exists; all 15 tables created with RLS; tenant policy on every company table; the 2 non-company tables are deny-all.
- (plus earlier `src/test/migrations-lint.test.ts` guarding the apostrophe defect.)
- Full suite: **210 passed / 2 skipped**; typecheck clean; prior build green.

## Remaining blockers / required owner input
1. **Production schema dump** (`pg_dump --schema-only` of the 15 tables, or Management-API query privilege on the prod project) to replace the heuristic DDL with production-faithful types/defaults/constraints/indexes/triggers and the **original** RLS. Current reconstruction is functionally correct + tenant-safe but not guaranteed byte-identical to prod.
2. **Confirm obsolete vs active:** if any of the 15 are obsolete, remove them from `types.ts` instead of migrating.
3. `ai_execution_steps` / `telnyx_webhook_events` tenant scoping (currently deny-all) — confirm the intended policy (likely via parent `ai_execution_runs`/company).

## Test evidence (commands)
- Reset + apply: `apply-migrations-mgmt.mts` → `67/67 applied`.
- Comparison: `comm -23 types_tables_only.txt fresh_tables.txt` → empty.
- RLS metadata + live checks as above. All against the **test** project only; production never written.

## Addendum (2026-10-21, post-merge to main)
Merging `main` brought its newer migrations, surfacing two fresh-build ordering/idempotency issues that are now fixed so a clean `supabase start` reproduces the whole schema:
- **Reconstruction re-ordered** `20261021000001` → **`20261014000000`** so it runs **before** main's `20261014000004_scope_ai_conversations_to_owner.sql` (which `DROP/CREATE`s policies on `ai_conversations`/`ai_messages`). The reconstruction's `ai_conversations`/`ai_messages` policies are named `"Members view own company conversations"`/`"...messages"` so `000004` cleanly drops them and installs the owner-scoped (`user_id = auth.uid()`) versions — verified owner-scoped after a full apply.
- **`20260913081611_global_workflow_templates.sql`** made idempotent (`create table if not exists` + column-guarded seed) because `20260913000001_close_production_gaps.sql` (earlier) already creates a different-schema `workflow_templates`; the plain `create table` crashed fresh builds. `workflow_templates` is DB-trigger-only (no app references), so this is app-safe. Editing the file is safe for production (already recorded in `schema_migrations`, so it does not re-run there).
- **Strict fresh apply now passes end-to-end: 92/92 migrations, zero tolerated errors.**
