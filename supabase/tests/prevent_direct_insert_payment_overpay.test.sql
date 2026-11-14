-- Regression tests for 20261112160000_prevent_direct_insert_payment_overpay.
-- Sequential business-rule scenarios only — the true concurrency scenario
-- (two simultaneous connections) cannot be expressed as sequential SQL and
-- lives in supabase/tests/runtime_payment_overpay_concurrency.sh instead.
-- Run with: supabase db query --linked -f supabase/tests/prevent_direct_insert_payment_overpay.test.sql
-- NOT executed in this session — see docs/security/PAYMENT_INTEGRITY_AUDIT.md
-- for why (no reachable non-production database).
begin;
select plan(1);

do $$
declare
  v_company uuid;
  v_other_company uuid;
  v_user uuid;
  v_admin uuid;
  v_other_user uuid;
  v_customer uuid;
  v_invoice uuid;
  v_other_invoice uuid;
  v_payment_600 uuid;
  rejected boolean;
begin
  insert into public.companies (id, name) values (gen_random_uuid(), 'Overpay Test Co') returning id into v_company;
  insert into public.companies (id, name) values (gen_random_uuid(), 'Other Test Co') returning id into v_other_company;

  insert into auth.users (id, email) values (gen_random_uuid(), 'overpay-user-'||gen_random_uuid()||'@test.local') returning id into v_user;
  insert into auth.users (id, email) values (gen_random_uuid(), 'overpay-admin-'||gen_random_uuid()||'@test.local') returning id into v_admin;
  insert into auth.users (id, email) values (gen_random_uuid(), 'overpay-other-'||gen_random_uuid()||'@test.local') returning id into v_other_user;
  update public.profiles set company_id = v_company where user_id = v_user;
  update public.profiles set company_id = v_company where user_id = v_admin;
  update public.profiles set company_id = v_other_company where user_id = v_other_user;
  insert into public.user_roles (user_id, company_id, role) values (v_admin, v_company, 'company_admin');

  insert into public.customers (id, company_id, name, email, record_type, status, created_by)
    values (gen_random_uuid(), v_company, 'Overpay Customer', 'overpay-customer@test.local', 'customer', 'customer', v_user)
    returning id into v_customer;

  insert into public.invoices (id, company_id, customer_id, invoice_number, amount, status, created_by)
    values (gen_random_uuid(), v_company, v_customer, 'OVERPAY-1', 1000, 'sent', v_user)
    returning id into v_invoice;
  insert into public.invoices (id, company_id, customer_id, invoice_number, amount, status, created_by)
    values (gen_random_uuid(), v_other_company, v_customer, 'OVERPAY-OTHER-1', 1000, 'sent', v_other_user)
    returning id into v_other_invoice;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  -- Scenario: 1000 invoice, 600 payment → accepted.
  insert into public.payments (id, company_id, invoice_id, amount, status, payment_method, created_by, idempotency_key)
    values (gen_random_uuid(), v_company, v_invoice, 600, 'completed', 'manual', v_user, 'overpay-600')
    returning id into v_payment_600;

  -- Scenario: remaining 400 → accepted, invoice becomes 'paid'.
  insert into public.payments (id, company_id, invoice_id, amount, status, payment_method, created_by, idempotency_key)
    values (gen_random_uuid(), v_company, v_invoice, 400, 'completed', 'manual', v_user, 'overpay-400');

  if (select status from public.invoices where id = v_invoice) <> 'paid' then
    raise exception 'Invoice was not marked paid after 600 + 400 = 1000';
  end if;

  -- Scenario: one more kr after fully paid → rejected (already-settled check).
  rejected := false;
  begin
    insert into public.payments (id, company_id, invoice_id, amount, status, payment_method, created_by, idempotency_key)
      values (gen_random_uuid(), v_company, v_invoice, 1, 'completed', 'manual', v_user, 'overpay-extra-1');
  exception when sqlstate '23505' then rejected := true;
  end;
  if not rejected then raise exception 'Payment after invoice fully paid was NOT rejected'; end if;

  -- Scenario: fresh 1000 invoice, single payment of 1001 → rejected outright.
  declare v_invoice2 uuid;
  begin
    insert into public.invoices (id, company_id, customer_id, invoice_number, amount, status, created_by)
      values (gen_random_uuid(), v_company, v_customer, 'OVERPAY-2', 1000, 'sent', v_user)
      returning id into v_invoice2;
    rejected := false;
    begin
      insert into public.payments (id, company_id, invoice_id, amount, status, payment_method, created_by, idempotency_key)
        values (gen_random_uuid(), v_company, v_invoice2, 1001, 'completed', 'manual', v_user, 'overpay-1001');
    exception when sqlstate '22003' then rejected := true;
    end;
    if not rejected then raise exception 'Single payment exceeding invoice amount was NOT rejected'; end if;
  end;

  -- Scenario: repeated identical idempotency key via the RPC → no extra row.
  declare v_replay_invoice uuid; v_count_before int; v_count_after int; v_r1 jsonb; v_r2 jsonb;
  begin
    insert into public.invoices (id, company_id, customer_id, invoice_number, amount, status, created_by)
      values (gen_random_uuid(), v_company, v_customer, 'OVERPAY-REPLAY', 500, 'sent', v_user)
      returning id into v_replay_invoice;
    v_r1 := public.register_invoice_payment(v_replay_invoice, 500, 'manual', now(), 'idem-replay-2', null, '{}');
    select count(*) into v_count_before from public.payments where invoice_id = v_replay_invoice;
    v_r2 := public.register_invoice_payment(v_replay_invoice, 500, 'manual', now(), 'idem-replay-2', null, '{}');
    select count(*) into v_count_after from public.payments where invoice_id = v_replay_invoice;
    if v_count_before <> v_count_after then raise exception 'Repeated idempotency key created an extra payment row'; end if;
    if not (v_r2->>'idempotent_replay')::boolean then raise exception 'RPC did not report the repeat as an idempotent replay'; end if;
  end;

  -- Scenario: negative amount → rejected. The new trigger's `amount <= 0`
  -- guard (22023) fires before the row ever reaches the schema-level
  -- payments_amount_nonnegative CHECK constraint (23514/check_violation),
  -- since it's a BEFORE trigger — so 22023 is what's actually raised here,
  -- not check_violation. The CHECK constraint remains in place underneath
  -- as defense-in-depth for any future write path that doesn't go through
  -- this trigger.
  rejected := false;
  begin
    insert into public.payments (id, company_id, invoice_id, amount, status, payment_method, created_by, idempotency_key)
      values (gen_random_uuid(), v_company, v_invoice, -1, 'completed', 'manual', v_user, 'overpay-negative');
  exception when sqlstate '22023' then rejected := true;
  end;
  if not rejected then raise exception 'Negative payment amount was NOT rejected'; end if;

  -- Scenario: zero amount → rejected by the new trigger guard.
  rejected := false;
  begin
    insert into public.payments (id, company_id, invoice_id, amount, status, payment_method, created_by, idempotency_key)
      values (gen_random_uuid(), v_company, v_invoice, 0, 'completed', 'manual', v_user, 'overpay-zero');
  exception when sqlstate '22023' then rejected := true;
  end;
  if not rejected then raise exception 'Zero payment amount was NOT rejected'; end if;

  -- Scenario: payment on a foreign company's invoice → rejected.
  rejected := false;
  begin
    insert into public.payments (id, company_id, invoice_id, amount, status, payment_method, created_by, idempotency_key)
      values (gen_random_uuid(), v_company, v_other_invoice, 100, 'completed', 'manual', v_user, 'overpay-cross-tenant');
  exception when sqlstate '42501' then rejected := true;
  end;
  if not rejected then raise exception 'Cross-tenant payment (own company_id, foreign invoice_id) was NOT rejected'; end if;

  -- Scenario: a non-admin reversing their own payment directly → rejected.
  rejected := false;
  begin
    update public.payments set reversed_at = now(), reversal_reason = 'test' where id = v_payment_600;
  exception when sqlstate '42501' then rejected := true;
  end;
  if not rejected then raise exception 'Non-admin payment reversal was NOT rejected'; end if;

  -- Scenario: a company admin reversing a payment directly → accepted.
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  update public.payments set reversed_at = now(), reversal_reason = 'admin test' where id = v_payment_600;
  if (select reversed_at from public.payments where id = v_payment_600) is null then
    raise exception 'Company admin reversal did not take effect';
  end if;

  -- Scenario: a non-admin marking a fresh invoice 'paid' directly (no
  -- registered payment) → rejected, so no fabricated payment is created.
  declare v_fabricate_invoice uuid; rejected2 boolean := false;
  begin
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    insert into public.invoices (id, company_id, customer_id, invoice_number, amount, status, created_by)
      values (gen_random_uuid(), v_company, v_customer, 'OVERPAY-FABRICATE-1', 1000, 'sent', v_user)
      returning id into v_fabricate_invoice;
    begin
      update public.invoices set status = 'paid' where id = v_fabricate_invoice;
    exception when sqlstate '42501' then rejected2 := true;
    end;
    if not rejected2 then raise exception 'Non-admin direct mark-as-paid (fabricated payment) was NOT rejected'; end if;
    if exists (select 1 from public.payments where invoice_id = v_fabricate_invoice) then
      raise exception 'A payment was fabricated despite the update being rejected';
    end if;
  end;

  -- Scenario: a company admin marking an invoice 'paid' directly (no
  -- registered payment) → accepted, fabricated bank_transfer payment
  -- created for the full amount. This is the legitimate manual-
  -- reconciliation path, now admin-gated instead of open to anyone.
  declare v_fabricate_invoice2 uuid;
  begin
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    insert into public.invoices (id, company_id, customer_id, invoice_number, amount, status, created_by)
      values (gen_random_uuid(), v_company, v_customer, 'OVERPAY-FABRICATE-2', 1000, 'sent', v_admin)
      returning id into v_fabricate_invoice2;
    update public.invoices set status = 'paid' where id = v_fabricate_invoice2;
    if not exists (select 1 from public.payments where invoice_id = v_fabricate_invoice2 and status = 'completed' and payment_method = 'bank_transfer' and amount = 1000) then
      raise exception 'Company admin direct mark-as-paid did not fabricate the expected bank_transfer payment';
    end if;
  end;
end $$;

select pass('direct-insert payment guards: overpay, zero/negative amount, cross-tenant, idempotent replay, admin-only reversal, admin-only fabricated-payment-on-mark-paid');
select * from finish();
rollback;
