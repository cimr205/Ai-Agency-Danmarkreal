-- PRE-STEP for deploying the feature/phase-3-production-hardening /
-- release/operating-kernel-final branch (not yet merged onto the live
-- database as of this migration). Run this immediately before that
-- branch's four migrations (20260912000001_operating_kernel.sql,
-- 20260912000002_connected_business_flows.sql,
-- 20260912000003_phase3_execution.sql,
-- 20260913000001_close_production_gaps.sql), in the same deploy window —
-- it is not meant to stand alone.
--
-- Why: that branch was written without visibility into twelve migrations
-- that were applied directly to this database (recovered into git as
-- 20260912102145_deal_won_onboarding.sql through
-- 20260913081611_global_workflow_templates.sql). Two of those created
-- tables the branch also defines, with incompatible column sets:
--
--   - workflow_templates: live has `key` as the unique identifier; the
--     branch's seed INSERT uses `on conflict(template_key)`, a column
--     that does not exist on the live table. Applied as-is, the branch's
--     20260913000001 migration would fail outright on that statement.
--   - invoice_payment_references: live uses amount/status columns; the
--     branch's create_invoice_payment_reference/
--     resolve_invoice_payment_reference functions operate on a
--     token_hash column the live table doesn't have. Because the table
--     already exists, the branch's `create table if not exists` is a
--     no-op, so this wouldn't fail at migration time — it would fail the
--     first time anyone actually tries to generate a Stripe payment link,
--     the exact feature this table exists for.
--
-- Both tables hold only seed/template data or are empty in production
-- (workflow_templates: 4 global template rows, no per-tenant data;
-- invoice_payment_references: 0 rows) — confirmed live before writing
-- this — so dropping and letting the branch's own CREATE TABLE run is
-- lower-risk than hand-migrating columns to match a schema this project
-- hasn't committed to yet.

DROP FUNCTION IF EXISTS public.instantiate_workflow_template(text);
DROP FUNCTION IF EXISTS public.create_invoice_payment_reference(uuid);
DROP FUNCTION IF EXISTS public.resolve_invoice_payment_reference(uuid);

DROP TABLE IF EXISTS public.workflow_templates;
DROP TABLE IF EXISTS public.invoice_payment_references;
