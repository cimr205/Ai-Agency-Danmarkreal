-- Executable contract tests for backend production epics.
-- Run after migrations with:
--   supabase db query --linked -f supabase/tests/backend_epics_e2e.test.sql
-- Every fixture is wrapped in a transaction and rolled back.

begin;

do $$
declare
  v_user_id uuid;
  v_company_id uuid;
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
  v_stage_id uuid;
  v_lead_1 uuid;
  v_lead_2 uuid;
  v_search_lead uuid;
  v_conversion_1 jsonb;
  v_conversion_1_repeat jsonb;
  v_conversion_2 jsonb;
  v_conversion_2_repeat jsonb;
  v_list jsonb;
  v_campaign_id uuid;
  v_recipient_1 uuid;
  v_recipient_2 uuid;
  v_email_job jsonb;
  v_email_job_repeat jsonb;
  v_customer_id uuid;
  v_invoice_id uuid;
  v_payment_1 jsonb;
  v_payment_replay jsonb;
  v_quote_id uuid;
  v_quote_invoice jsonb;
  v_quote_invoice_repeat jsonb;
  v_device_id uuid;
  v_command jsonb;
  v_command_repeat jsonb;
begin
  select user_id, company_id into v_user_id, v_company_id
  from public.profiles where company_id is not null order by created_at limit 1;
  if v_user_id is null then raise exception 'Test requires one existing authenticated profile'; end if;
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- CRM: stage mapping, same-lead idempotency, and matched-existing idempotency.
  insert into public.pipeline_stages (company_id, name, order_index)
  values (v_company_id, 'Contract stage ' || v_suffix, 9999) returning id into v_stage_id;
  insert into public.customers (company_id, created_by, name, email, phone, record_type)
  values (v_company_id, v_user_id, 'Contract lead one', 'contract-' || v_suffix || '@example.com', '20304050', 'lead')
  returning id into v_lead_1;
  insert into public.customers (company_id, created_by, name, email, phone, record_type)
  values (v_company_id, v_user_id, 'Contract lead two', upper('contract-' || v_suffix || '@example.com'), null, 'lead')
  returning id into v_lead_2;

  select to_jsonb(r) into v_conversion_1 from public.convert_lead_to_deal(v_lead_1, 'Contract deal one', v_stage_id, 100, 'DKK') r;
  select to_jsonb(r) into v_conversion_1_repeat from public.convert_lead_to_deal(v_lead_1, 'Ignored replay', null, 999, 'EUR') r;
  if v_conversion_1->>'customer_id' is distinct from v_conversion_1_repeat->>'customer_id'
    or v_conversion_1->>'deal_id' is distinct from v_conversion_1_repeat->>'deal_id' then
    raise exception 'Same-lead conversion is not idempotent';
  end if;
  if not exists (select 1 from public.deals where id = (v_conversion_1->>'deal_id')::uuid
    and customer_id = (v_conversion_1->>'customer_id')::uuid and stage = 'Contract stage ' || v_suffix and currency = 'DKK') then
    raise exception 'Deal did not retain customer, pipeline stage, or currency';
  end if;

  select to_jsonb(r) into v_conversion_2 from public.convert_lead_to_deal(v_lead_2, 'Contract deal two', null, 200, 'DKK') r;
  select to_jsonb(r) into v_conversion_2_repeat from public.convert_lead_to_deal(v_lead_2, 'Ignored replay', null, 200, 'DKK') r;
  if v_conversion_2->>'dedupe_result' <> 'matched_existing' then raise exception 'Second lead did not match existing customer'; end if;
  if v_conversion_2->>'customer_id' is distinct from v_conversion_2_repeat->>'customer_id'
    or v_conversion_2_repeat->>'customer_id' is null then
    raise exception 'Matched-existing replay lost customer_id';
  end if;

  insert into public.customers (company_id, created_by, name, email, industry, status, record_type)
  values (v_company_id, v_user_id, 'Searchable ' || v_suffix, 'search-' || v_suffix || '@example.com', 'testing', 'new', 'lead')
  returning id into v_search_lead;
  v_list := public.list_leads(0, 10, v_suffix, 'name', 'asc', 'new', null, null, null, null, null, 'or', 'testing');
  if (v_list->>'total_count')::integer <> 1 or (v_list->'items'->0->>'id')::uuid <> v_search_lead then
    raise exception 'Server-side lead listing did not apply search/filter/pagination';
  end if;

  -- Email: suppression, durable delivery creation, and enqueue idempotency.
  insert into public.bulk_email_campaigns (company_id, user_id, subject, status)
  values (v_company_id, v_user_id, 'Contract campaign ' || v_suffix, 'draft') returning id into v_campaign_id;
  insert into public.bulk_email_recipients (campaign_id, company_id, email, name, status)
  values (v_campaign_id, v_company_id, 'send-' || v_suffix || '@example.com', 'Send Recipient', 'queued') returning id into v_recipient_1;
  insert into public.bulk_email_recipients (campaign_id, company_id, email, name, status)
  values (v_campaign_id, v_company_id, 'suppress-' || v_suffix || '@example.com', 'Suppressed Recipient', 'queued') returning id into v_recipient_2;
  insert into public.email_suppression_list (company_id, email, reason, created_by)
  values (v_company_id, 'suppress-' || v_suffix || '@example.com', 'manual', v_user_id);
  v_email_job := public.enqueue_email_campaign(v_campaign_id, 'contract-' || v_suffix,
    '<p>Hello {{first_name}}</p>', 'Hello {{first_name}}', 'sender@example.com', null, null, null, 3);
  v_email_job_repeat := public.enqueue_email_campaign(v_campaign_id, 'contract-' || v_suffix,
    '<p>Hello {{first_name}}</p>', 'Hello {{first_name}}', 'sender@example.com', null, null, null, 3);
  if v_email_job->>'job_id' is distinct from v_email_job_repeat->>'job_id' then raise exception 'Email enqueue is not idempotent'; end if;
  if (select count(*) from public.email_delivery_jobs where campaign_job_id = (v_email_job->>'job_id')::uuid) <> 2 then
    raise exception 'Email delivery jobs were not created exactly once';
  end if;
  if not exists (select 1 from public.email_delivery_jobs where recipient_id = v_recipient_2 and status = 'suppressed') then
    raise exception 'Suppression list was not enforced at enqueue';
  end if;

  -- Finance: payment replay, exact balance, and quote conversion replay.
  insert into public.customers (company_id, created_by, name, email, record_type)
  values (v_company_id, v_user_id, 'Contract customer', 'customer-' || v_suffix || '@example.com', 'customer')
  returning id into v_customer_id;
  insert into public.invoices (company_id, customer_id, invoice_number, amount, status, created_by)
  values (v_company_id, v_customer_id, 'CONTRACT-' || v_suffix, 125, 'sent', v_user_id) returning id into v_invoice_id;
  v_payment_1 := public.register_invoice_payment(v_invoice_id, 25, 'bank_transfer', now(), 'payment-' || v_suffix, null, '{}'::jsonb);
  v_payment_replay := public.register_invoice_payment(v_invoice_id, 25, 'bank_transfer', now(), 'payment-' || v_suffix, null, '{}'::jsonb);
  if v_payment_1->>'payment_id' is distinct from v_payment_replay->>'payment_id'
    or (v_payment_replay->>'idempotent_replay')::boolean is not true then raise exception 'Payment replay is not idempotent'; end if;
  perform public.register_invoice_payment(v_invoice_id, 100, 'bank_transfer', now(), 'payment-final-' || v_suffix, null, '{}'::jsonb);
  if (select status from public.invoices where id = v_invoice_id) <> 'paid' then raise exception 'Invoice was not paid at exact balance'; end if;
  begin
    perform public.register_invoice_payment(v_invoice_id, 1, 'bank_transfer', now(), 'payment-over-' || v_suffix, null, '{}'::jsonb);
    raise exception 'Overpayment was accepted';
  exception when numeric_value_out_of_range then null;
  end;

  insert into public.quotes (company_id, customer_id, title, total, status, created_by)
  values (v_company_id, v_customer_id, 'Contract quote', 50, 'accepted', v_user_id) returning id into v_quote_id;
  v_quote_invoice := public.quote_to_invoice(v_quote_id, 'QUOTE-' || v_suffix, current_date + 14);
  v_quote_invoice_repeat := public.quote_to_invoice(v_quote_id, 'IGNORED-' || v_suffix, current_date + 30);
  if v_quote_invoice->>'invoice_id' is distinct from v_quote_invoice_repeat->>'invoice_id' then
    raise exception 'Quote conversion is not idempotent';
  end if;

  -- Device relay DB contract: only a verified, live, owned device can receive commands.
  v_device_id := gen_random_uuid();
  insert into public.phone_devices (
    id, company_id, user_id, display_name, platform, device_token_hash, status,
    capabilities, last_heartbeat_at, last_seen_at
  ) values (
    v_device_id, v_company_id, v_user_id, 'Contract Android', 'android', encode(digest(v_suffix, 'sha256'), 'hex'),
    'online', '{"direct_carrier_call":true}'::jsonb, now(), now()
  );
  v_command := public.create_phone_call_command(v_device_id, '20304050', v_search_lead,
    'Searchable', 'call-' || v_suffix, '{}'::jsonb);
  v_command_repeat := public.create_phone_call_command(v_device_id, '20304050', v_search_lead,
    'Searchable', 'call-' || v_suffix, '{}'::jsonb);
  if v_command->>'command_id' is distinct from v_command_repeat->>'command_id'
    or (v_command->>'requires_confirmation')::boolean is not false then
    raise exception 'Device command idempotency/capability handling failed';
  end if;
end;
$$;

rollback;
