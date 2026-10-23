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

-- In a sequential build 20260913000001's `create table if not exists` was a
-- no-op (the old-shape table from 20260912111319 still existed), so the table
-- it defines must be created here after the old one is dropped. Identical to
-- 20260913000001 and to production; a no-op where the table already exists.
create table if not exists public.invoice_payment_references (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  stripe_checkout_session_id text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.invoice_payment_references enable row level security;
drop policy if exists "Members view invoice payment references" on public.invoice_payment_references;
create policy "Members view invoice payment references" on public.invoice_payment_references
  for select to authenticated using(company_id=public.get_user_company_id(auth.uid()));
