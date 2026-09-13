-- Removes the "first company admin found" fallback from both
-- system-originated write paths, now that customers.created_by,
-- payments.created_by, and activity_logs.user_id are nullable
-- (20260913000001_status_rpcs_and_nullable_actor.sql). System-originated
-- rows now correctly record created_by/user_id = NULL rather than
-- attributing the action to an arbitrary human who happens to be an admin.

create or replace function public.ingest_meta_lead(
  p_meta_leadgen_id text,
  p_meta_page_id text,
  p_meta_form_id text,
  p_meta_ad_id text,
  p_meta_adset_id text,
  p_meta_campaign_id text,
  p_name text,
  p_email text,
  p_phone text,
  p_raw jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_event_id uuid;
  v_company_id uuid;
  v_norm_email text;
  v_norm_phone text;
  v_identity_key text;
  v_customer_id uuid;
  v_campaign_uuid uuid;
  v_dedupe text := 'created';
begin
  insert into public.meta_leadgen_events (
    meta_leadgen_id, meta_page_id, meta_form_id, meta_ad_id, meta_adset_id, meta_campaign_id, raw
  ) values (
    p_meta_leadgen_id, p_meta_page_id, p_meta_form_id, p_meta_ad_id, p_meta_adset_id, p_meta_campaign_id, coalesce(p_raw, '{}'::jsonb)
  )
  on conflict (meta_leadgen_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('duplicate', true);
  end if;

  select page.company_id into v_company_id
  from public.meta_pages page
  where page.page_id = p_meta_page_id;

  if v_company_id is null then
    update public.meta_leadgen_events
    set status = 'skipped_unmatched_page', processed_at = now()
    where id = v_event_id;
    return jsonb_build_object('duplicate', false, 'matched_page', false);
  end if;

  begin
    v_norm_email := nullif(lower(trim(coalesce(p_email, ''))), '');
    v_norm_phone := public.normalize_phone_number(p_phone);

    v_identity_key := v_company_id::text || ':' || coalesce(
      case when v_norm_email is not null then 'email:' || v_norm_email end,
      case when v_norm_phone is not null then 'phone:' || v_norm_phone end,
      'leadgen:' || p_meta_leadgen_id
    );
    perform pg_advisory_xact_lock(hashtextextended(v_identity_key, 0));

    if p_meta_campaign_id is not null then
      select mc.id into v_campaign_uuid
      from public.meta_campaigns mc
      where mc.company_id = v_company_id and mc.meta_campaign_id = p_meta_campaign_id;
    end if;

    if v_norm_email is not null then
      select c.id into v_customer_id
      from public.customers c
      where c.company_id = v_company_id and c.normalized_email = v_norm_email
      order by (c.record_type = 'customer') desc, c.created_at
      limit 1
      for update;
    end if;

    if v_customer_id is null and v_norm_phone is not null then
      select c.id into v_customer_id
      from public.customers c
      where c.company_id = v_company_id and c.normalized_phone = v_norm_phone
      order by (c.record_type = 'customer') desc, c.created_at
      limit 1
      for update;
    end if;

    if v_customer_id is not null then
      v_dedupe := 'matched_existing';
      update public.customers
      set last_touched_at = now(),
          meta_leadgen_id = coalesce(meta_leadgen_id, p_meta_leadgen_id),
          campaign_id = coalesce(campaign_id, v_campaign_uuid)
      where id = v_customer_id;
    else
      insert into public.customers (
        company_id, created_by, name, email, phone, record_type, status,
        lead_source, meta_leadgen_id, campaign_id
      ) values (
        v_company_id,
        null,
        coalesce(nullif(trim(p_name), ''), nullif(v_norm_email, ''), nullif(v_norm_phone, ''), 'Meta lead'),
        coalesce(p_email, ''),
        p_phone,
        'lead', 'new',
        'meta_ads', p_meta_leadgen_id, v_campaign_uuid
      )
      returning id into v_customer_id;
    end if;

    update public.meta_leadgen_events
    set status = 'processed', customer_id = v_customer_id, processed_at = now()
    where id = v_event_id;

    return jsonb_build_object('duplicate', false, 'matched_page', true, 'customer_id', v_customer_id, 'dedupe_result', v_dedupe);
  exception when others then
    update public.meta_leadgen_events
    set status = 'failed', error = sqlerrm, processed_at = now()
    where id = v_event_id;
    return jsonb_build_object('duplicate', false, 'matched_page', true, 'error', sqlerrm);
  end;
end;
$$;

revoke all on function public.ingest_meta_lead(text, text, text, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.ingest_meta_lead(text, text, text, text, text, text, text, text, text, jsonb) to service_role;
revoke execute on function public.ingest_meta_lead(text, text, text, text, text, text, text, text, text, jsonb) from anon, authenticated;

create or replace function public.register_invoice_payment_service(
  p_company_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_idempotency_key text,
  p_external_reference text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_invoice public.invoices%rowtype;
  v_payment public.payments%rowtype;
  v_paid numeric;
begin
  if coalesce(p_amount, 0) <= 0 then raise exception 'Payment amount must be positive' using errcode = '22023'; end if;
  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Idempotency key is required' using errcode = '22023';
  end if;

  select * into v_invoice from public.invoices
  where id = p_invoice_id and company_id = p_company_id for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if v_invoice.status = 'cancelled' or v_invoice.voided_at is not null then
    raise exception 'Cannot pay a voided invoice' using errcode = '55000';
  end if;

  select * into v_payment from public.payments
  where company_id = p_company_id and idempotency_key = trim(p_idempotency_key);
  if found then
    if v_payment.invoice_id <> p_invoice_id or v_payment.amount <> p_amount then
      raise exception 'Idempotency key was used with different payment data' using errcode = '23505';
    end if;
    return jsonb_build_object('payment_id', v_payment.id, 'invoice_id', p_invoice_id,
      'invoice_status', v_invoice.status, 'idempotent_replay', true);
  end if;

  select coalesce(sum(amount), 0) into v_paid from public.payments
  where invoice_id = p_invoice_id and company_id = p_company_id
    and status = 'completed' and reversed_at is null;
  if p_amount > (v_invoice.amount - v_paid) then
    raise exception 'Payment exceeds remaining invoice balance' using errcode = '22003';
  end if;

  insert into public.payments (
    company_id, invoice_id, amount, status, payment_method, paid_at, created_by,
    idempotency_key, external_reference, metadata
  ) values (
    p_company_id, p_invoice_id, p_amount, 'completed', nullif(trim(p_payment_method), ''),
    now(), null, trim(p_idempotency_key),
    nullif(trim(coalesce(p_external_reference, '')), ''), coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_payment;

  v_paid := v_paid + p_amount;
  update public.invoices
  set status = case when v_paid >= amount then 'paid'::public.invoice_status
                    when status = 'draft' then 'sent'::public.invoice_status else status end,
      paid_at = case when v_paid >= amount then now() else null end,
      version = version + 1,
      updated_at = now()
  where id = p_invoice_id;

  insert into public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description, metadata)
  values (null, p_company_id, 'invoice_payment_registered', 'invoice', p_invoice_id,
    'Payment registered for invoice ' || v_invoice.invoice_number || ' via ' || coalesce(p_payment_method, 'webhook'),
    jsonb_build_object('payment_id', v_payment.id, 'amount', p_amount, 'remaining', greatest(v_invoice.amount - v_paid, 0)));

  return jsonb_build_object('payment_id', v_payment.id, 'invoice_id', p_invoice_id,
    'invoice_status', case when v_paid >= v_invoice.amount then 'paid' else 'sent' end,
    'paid_total', v_paid, 'remaining', greatest(v_invoice.amount - v_paid, 0),
    'idempotent_replay', false);
end;
$$;

revoke all on function public.register_invoice_payment_service(uuid, uuid, numeric, text, text, text, jsonb) from public;
grant execute on function public.register_invoice_payment_service(uuid, uuid, numeric, text, text, text, jsonb) to service_role;
revoke execute on function public.register_invoice_payment_service(uuid, uuid, numeric, text, text, text, jsonb) from anon, authenticated;
