-- Phase B1 of the CRM restructuring: additive schema change + one-time data
-- backfill that copies every `leads` row into `customers` as a
-- record_type = 'lead' row, preserving the original id. This is purely
-- additive — no existing column, row, FK, or app code is touched. Nothing
-- reads these new columns/rows yet; that repointing is Phase B2, a
-- separately-planned pass, once this has shipped and been verified live.
--
-- IDs are preserved on purpose so that Phase B2 can repoint
-- lead_icp_scores.lead_id / quotes.lead_id / tasks.lead_id from leads(id) to
-- customers(id) without any ID remapping — the same UUID will already exist
-- as a row in customers by the time that happens.

-- 1. Discriminator column. Existing customers rows already default correctly.
alter table public.customers
  add column record_type text not null default 'customer'
    check (record_type in ('lead', 'customer'));

-- 2. Every lead-only column, all nullable/defaulted so existing customers
-- rows are completely unaffected.
alter table public.customers
  add column status public.lead_status,
  add column score integer default 0,
  add column owner_id uuid references public.profiles(user_id),
  add column notes text,
  add column value numeric default 0,
  add column company_name text,
  add column next_followup_at timestamptz,
  add column last_touched_at timestamptz default now(),
  add column ai_recommendation text,
  add column ai_recommendation_at timestamptz,
  add column currency text default 'DKK',
  add column import_batch_id uuid,
  add column tags text[] default '{}',
  add column industry text,
  add column folder_id uuid references public.lead_folders(id) on delete set null,
  add column city text;

-- 3. Indexes mirroring the existing `leads` indexes, scoped to what Phase B2
-- queries will need once they read record_type = 'lead' rows from here.
create index idx_customers_company_record_status on public.customers (company_id, record_type, status);
create index idx_customers_company_record_created on public.customers (company_id, record_type, created_at);
create index idx_customers_owner on public.customers (owner_id);
create index idx_customers_folder on public.customers (folder_id);
create index idx_customers_next_followup on public.customers (next_followup_at);
create index idx_customers_last_touched on public.customers (last_touched_at);
create index idx_customers_import_batch on public.customers (import_batch_id);

-- 4. Reconcile the DELETE RLS policy to be discriminator-aware: anyone in
-- the company can delete record_type = 'lead' rows (matches today's `leads`
-- policy), only a company admin can delete record_type = 'customer' rows
-- (matches today's `customers` policy, unchanged for existing rows). This is
-- safe to ship now even though it's a real policy change: until Phase B2
-- repoints app code, nothing queries `customers` for record_type = 'lead'
-- rows, so the relaxed half of this policy is inert until then.
drop policy "Admins can delete customers" on public.customers;
create policy "Delete customers or leads per role" on public.customers
  for delete using (
    company_id = get_user_company_id(auth.uid())
    and (record_type = 'lead' or is_company_admin(auth.uid()))
  );

-- 5. The data backfill is intentionally NOT part of this migration.
--
-- It was run once, live, and immediately reverted: `useCustomers()`
-- (src/hooks/api/useFinance.ts) and the Klienter list page both query
-- `customers` with an unfiltered `select('*')`, so the moment record_type
-- = 'lead' rows existed, they appeared as real, clickable clients in the
-- live Klienter UI — a genuine "zero app-visible impact" violation, not a
-- theoretical one (confirmed by clicking through to the migrated row's own
-- /clients/:id detail page in production). The rows were deleted
-- (`delete from customers where record_type = 'lead'`) and the app verified
-- back to its exact pre-migration state.
--
-- The backfill INSERT (same statement used for the reverted run, safe to
-- reuse verbatim, idempotent via ON CONFLICT DO NOTHING on id) now belongs
-- in Phase B2, run in the same deploy as the read-side `record_type`
-- filtering that makes it safe to populate.
