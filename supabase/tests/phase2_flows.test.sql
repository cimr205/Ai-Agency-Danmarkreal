-- Manual verification script for the Phase 2 flows added in
-- 20260912000001_deal_won_onboarding.sql, 20260912000003_meta_lead_ads.sql,
-- 20260912000004_gmail_reply_routing.sql, and
-- 20260912000005_stripe_invoice_payments.sql.
--
-- Run with: supabase db query --linked -f supabase/tests/phase2_flows.test.sql
--
-- Same convention as convert_lead_to_deal.test.sql (no pgTAP-specific
-- syntax used, even though the pgtap extension is installed in this
-- project) — plain SQL, inserts fixtures, calls the RPCs/triggers the same
-- way the app does, asserts via RAISE EXCEPTION on failure, cleans up
-- after itself.
--
-- STATUS: written but NOT executed against the live project in this
-- session. Every scenario here was reasoned through against the actual
-- deployed function/trigger bodies and cross-checked structurally
-- (pg_proc/pg_trigger existence, column/constraint presence), but running
-- fixture inserts against the shared production database is a real,
-- consented action this session did not have authorization to take —
-- Docker/local Postgres was unavailable, and creating an isolated Supabase
-- branch requires cost confirmation only the user can give. Mark this
-- BLOCKED for live execution until a future session runs it, either in a
-- confirmed branch or locally.

do $$
declare
  v_company uuid;
  v_admin uuid;
  v_customer_id uuid;
  v_deal_id uuid;
  v_run_count int;
  v_task_count int;
  v_result jsonb;
  v_invoice_id uuid;
  v_payment_count int;
begin
  insert into public.companies (id, name) values (gen_random_uuid(), 'Phase2 Test Co') returning id into v_company;
  -- A profile + company_admin role is required so the system-originated
  -- inserts (ingest_meta_lead, handle_deal_won_event) can resolve a
  -- created_by fallback the same way they would in production.
  v_admin := gen_random_uuid();
  insert into public.profiles (user_id, email, company_id) values (v_admin, 'admin@phase2test.invalid', v_company);
  insert into public.user_roles (user_id, role) values (v_admin, 'company_admin');

  -- ── Flow 3: deal.won -> onboarding, exactly-once ──────────────────────
  insert into public.customers (company_id, created_by, name, email, record_type, status)
  values (v_company, v_admin, 'Phase2 Customer', 'customer@phase2test.invalid', 'customer', 'customer')
  returning id into v_customer_id;

  insert into public.deals (company_id, created_by, customer_id, title, value, stage)
  values (v_company, v_admin, v_customer_id, 'Phase2 Deal', 1000, 'discovery')
  returning id into v_deal_id;

  update public.deals set stage = 'won' where id = v_deal_id;

  select count(*) into v_run_count from public.onboarding_runs where deal_id = v_deal_id;
  if v_run_count <> 1 then
    raise exception 'deal.won: expected exactly 1 onboarding_runs row, got %', v_run_count;
  end if;

  select count(*) into v_task_count from public.tasks where deal_id = v_deal_id;
  if v_task_count = 0 then
    raise exception 'deal.won: expected onboarding tasks to be created from the default template, got 0';
  end if;

  -- Re-fire deal.won manually (simulates a retried/duplicate event) —
  -- must not create a second onboarding_runs row or duplicate tasks.
  perform emit_workspace_event(v_company, 'deal.won', 'crm', 'deal', v_deal_id::text, '{}'::jsonb, v_admin);

  select count(*) into v_run_count from public.onboarding_runs where deal_id = v_deal_id;
  if v_run_count <> 1 then
    raise exception 'deal.won retry: expected still exactly 1 onboarding_runs row, got %', v_run_count;
  end if;

  select count(*) into v_task_count from public.tasks where deal_id = v_deal_id;
  if v_task_count <> (select jsonb_array_length(tasks) from public.onboarding_templates where is_default and company_id is null) then
    raise exception 'deal.won retry: task count changed after a duplicate event, expected no new tasks';
  end if;

  -- ── Flow 1: Meta lead ingestion — duplicate webhook, unmatched page ───
  select ingest_meta_lead(
    'phase2-leadgen-1', 'phase2-unmatched-page', 'form-1', 'ad-1', 'adset-1', 'campaign-1',
    'Jane Lead', 'jane@phase2test.invalid', '+4520304050', '{}'::jsonb
  ) into v_result;
  if (v_result->>'matched_page')::boolean is not false then
    raise exception 'ingest_meta_lead: expected matched_page=false for an unmatched page, got %', v_result;
  end if;

  -- Duplicate delivery of the same leadgen id must be a clean no-op.
  select ingest_meta_lead(
    'phase2-leadgen-1', 'phase2-unmatched-page', 'form-1', 'ad-1', 'adset-1', 'campaign-1',
    'Jane Lead', 'jane@phase2test.invalid', '+4520304050', '{}'::jsonb
  ) into v_result;
  if (v_result->>'duplicate')::boolean is not true then
    raise exception 'ingest_meta_lead: expected duplicate=true on a replayed leadgen id, got %', v_result;
  end if;

  -- ── Flow 4: idempotent invoice payment via the service RPC ────────────
  insert into public.invoices (company_id, created_by, invoice_number, amount, status)
  values (v_company, v_admin, 'PHASE2-INV-1', 500, 'sent')
  returning id into v_invoice_id;

  perform register_invoice_payment_service(v_company, v_invoice_id, 500, 'stripe_checkout', 'phase2-evt-1', 'cs_test_1', '{}'::jsonb);
  perform register_invoice_payment_service(v_company, v_invoice_id, 500, 'stripe_checkout', 'phase2-evt-1', 'cs_test_1', '{}'::jsonb);

  select count(*) into v_payment_count from public.payments where invoice_id = v_invoice_id;
  if v_payment_count <> 1 then
    raise exception 'register_invoice_payment_service: expected exactly 1 payment after a duplicate webhook delivery, got %', v_payment_count;
  end if;

  if (select status from public.invoices where id = v_invoice_id) <> 'paid' then
    raise exception 'register_invoice_payment_service: invoice should be paid after a full payment';
  end if;

  raise notice 'phase2_flows.test.sql: all assertions passed';

  -- ── Cleanup ────────────────────────────────────────────────────────────
  delete from public.payments where invoice_id = v_invoice_id;
  delete from public.invoices where id = v_invoice_id;
  delete from public.tasks where deal_id = v_deal_id;
  delete from public.onboarding_runs where deal_id = v_deal_id;
  delete from public.deals where id = v_deal_id;
  delete from public.customers where id = v_customer_id;
  delete from public.meta_leadgen_events where meta_leadgen_id = 'phase2-leadgen-1';
  delete from public.user_roles where user_id = v_admin;
  delete from public.profiles where user_id = v_admin;
  delete from public.companies where id = v_company;
end $$;
