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

-- Only drop the tables while they still have the incompatible pre-branch
-- shape. In production this migration ran BEFORE the branch migrations, so
-- the drop happened there. In a fresh/sequential build it runs AFTER them
-- (later timestamp), when the tables already have the branch's schema — an
-- unconditional drop then deleted them and nothing recreated them
-- (workflow_templates / invoice_payment_references "does not exist" in CI).
-- Already recorded in production schema_migrations, so this edit only
-- affects fresh builds.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workflow_templates' AND column_name = 'key'
  ) THEN
    DROP TABLE public.workflow_templates;
  END IF;

  IF to_regclass('public.invoice_payment_references') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoice_payment_references' AND column_name = 'token_hash'
  ) THEN
    DROP TABLE public.invoice_payment_references;
  END IF;
END $$;
