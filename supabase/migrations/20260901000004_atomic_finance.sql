-- Epic 3: atomic invoice payments, safe void/delete paths, and quote lifecycle.

alter table public.payments
  add column if not exists idempotency_key text,
  add column if not exists external_reference text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_reason text;

create unique index if not exists payments_company_idempotency_unique
  on public.payments (company_id, idempotency_key)
  where idempotency_key is not null;

alter table public.invoices
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason text,
  add column if not exists version integer not null default 1,
  add column if not exists quote_id uuid references public.quotes(id) on delete set null;

alter table public.quotes
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists sent_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists converted_invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists version integer not null default 1;

update public.quotes q
set customer_id = coalesce(
  (select d.customer_id from public.deals d
   where d.id = q.deal_id and d.company_id = q.company_id),
  (select coalesce(lead.converted_customer_id,
      case when lead.record_type = 'customer' then lead.id else null end)
   from public.customers lead
   where lead.id = q.lead_id and lead.company_id = q.company_id)
)
where q.customer_id is null;

create or replace function public.register_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_paid_at timestamptz default now(),
  p_idempotency_key text default null,
  p_external_reference text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.get_user_company_id(auth.uid());
  v_invoice public.invoices%rowtype;
  v_payment public.payments%rowtype;
  v_paid numeric;
  v_remaining numeric;
begin
  if auth.uid() is null or v_company_id is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Payment amount must be positive' using errcode = '22023'; end if;
  if nullif(trim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Idempotency key is required' using errcode = '22023';
  end if;

  select * into v_invoice from public.invoices
  where id = p_invoice_id and company_id = v_company_id for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if v_invoice.status = 'cancelled' or v_invoice.voided_at is not null then
    raise exception 'Cannot pay a voided invoice' using errcode = '55000';
  end if;

  select * into v_payment from public.payments
  where company_id = v_company_id and idempotency_key = trim(p_idempotency_key);
  if found then
    if v_payment.invoice_id <> p_invoice_id or v_payment.amount <> p_amount then
      raise exception 'Idempotency key was used with different payment data' using errcode = '23505';
    end if;
    return jsonb_build_object('payment_id', v_payment.id, 'invoice_id', p_invoice_id,
      'invoice_status', v_invoice.status, 'idempotent_replay', true);
  end if;

  select coalesce(sum(amount), 0) into v_paid from public.payments
  where invoice_id = p_invoice_id and company_id = v_company_id
    and status = 'completed' and reversed_at is null;
  v_remaining := v_invoice.amount - v_paid;
  if p_amount > v_remaining then
    raise exception 'Payment exceeds remaining invoice balance' using errcode = '22003';
  end if;

  insert into public.payments (
    company_id, invoice_id, amount, status, payment_method, paid_at, created_by,
    idempotency_key, external_reference, metadata
  ) values (
    v_company_id, p_invoice_id, p_amount, 'completed', nullif(trim(p_payment_method), ''),
    coalesce(p_paid_at, now()), auth.uid(), trim(p_idempotency_key),
    nullif(trim(coalesce(p_external_reference, '')), ''), coalesce(p_metadata, '{}'::jsonb)
  ) returning * into v_payment;

  v_paid := v_paid + p_amount;
  update public.invoices
  set status = case when v_paid >= amount then 'paid'::public.invoice_status
                    when status = 'draft' then 'sent'::public.invoice_status else status end,
      paid_at = case when v_paid >= amount then coalesce(p_paid_at, now()) else null end,
      version = version + 1,
      updated_at = now()
  where id = p_invoice_id;

  insert into public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description, metadata)
  values (auth.uid(), v_company_id, 'invoice_payment_registered', 'invoice', p_invoice_id,
    'Payment registered for invoice ' || v_invoice.invoice_number,
    jsonb_build_object('payment_id', v_payment.id, 'amount', p_amount, 'remaining', greatest(v_invoice.amount - v_paid, 0)));

  return jsonb_build_object('payment_id', v_payment.id, 'invoice_id', p_invoice_id,
    'invoice_status', case when v_paid >= v_invoice.amount then 'paid' else 'sent' end,
    'paid_total', v_paid, 'remaining', greatest(v_invoice.amount - v_paid, 0),
    'idempotent_replay', false);
end;
$$;

create or replace function public.void_invoice(
  p_invoice_id uuid,
  p_reason text,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.get_user_company_id(auth.uid());
  v_invoice public.invoices%rowtype;
  v_payments integer;
begin
  if auth.uid() is null or v_company_id is null or not public.is_company_admin(auth.uid()) then
    raise exception 'Company admin required' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Void reason is required' using errcode = '22023'; end if;
  select * into v_invoice from public.invoices where id = p_invoice_id and company_id = v_company_id for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if p_expected_version is not null and v_invoice.version <> p_expected_version then
    raise exception 'Invoice was modified by another user' using errcode = '40001';
  end if;
  if v_invoice.status = 'cancelled' then
    return jsonb_build_object('invoice_id', p_invoice_id, 'status', 'cancelled', 'idempotent_replay', true);
  end if;
  select count(*) into v_payments from public.payments
  where invoice_id = p_invoice_id and status = 'completed' and reversed_at is null;
  if v_payments > 0 then raise exception 'Reverse completed payments before voiding the invoice' using errcode = '55000'; end if;
  update public.invoices set status = 'cancelled', voided_at = now(), voided_by = auth.uid(),
    void_reason = trim(p_reason), version = version + 1, updated_at = now() where id = p_invoice_id;
  return jsonb_build_object('invoice_id', p_invoice_id, 'status', 'cancelled', 'idempotent_replay', false);
end;
$$;

create or replace function public.delete_draft_invoice(p_invoice_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.get_user_company_id(auth.uid());
  v_invoice public.invoices%rowtype;
begin
  if auth.uid() is null or v_company_id is null or not public.is_company_admin(auth.uid()) then
    raise exception 'Company admin required' using errcode = '42501';
  end if;
  select * into v_invoice from public.invoices where id = p_invoice_id and company_id = v_company_id for update;
  if not found then return false; end if;
  if v_invoice.status <> 'draft' then raise exception 'Only draft invoices can be deleted' using errcode = '55000'; end if;
  if exists (select 1 from public.payments where invoice_id = p_invoice_id) then
    raise exception 'Invoice with payment history cannot be deleted' using errcode = '55000';
  end if;
  delete from public.invoices where id = p_invoice_id;
  return true;
end;
$$;

create or replace function public.transition_quote(
  p_quote_id uuid,
  p_target_status text,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.get_user_company_id(auth.uid());
  v_quote public.quotes%rowtype;
  v_target text := lower(trim(p_target_status));
begin
  if auth.uid() is null or v_company_id is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into v_quote from public.quotes where id = p_quote_id and company_id = v_company_id for update;
  if not found then raise exception 'Quote not found' using errcode = 'P0002'; end if;
  if p_expected_version is not null and v_quote.version <> p_expected_version then
    raise exception 'Quote was modified by another user' using errcode = '40001';
  end if;
  if not (
    (v_quote.status = 'draft' and v_target in ('sent','cancelled')) or
    (v_quote.status = 'sent' and v_target in ('accepted','rejected','expired','cancelled')) or
    (v_quote.status = v_target)
  ) then raise exception 'Invalid quote transition: % -> %', v_quote.status, v_target using errcode = '55000'; end if;

  update public.quotes set status = v_target,
    sent_at = case when v_target = 'sent' then coalesce(sent_at, now()) else sent_at end,
    accepted_at = case when v_target = 'accepted' then coalesce(accepted_at, now()) else accepted_at end,
    rejected_at = case when v_target = 'rejected' then coalesce(rejected_at, now()) else rejected_at end,
    expired_at = case when v_target = 'expired' then coalesce(expired_at, now()) else expired_at end,
    version = case when status = v_target then version else version + 1 end,
    updated_at = now()
  where id = p_quote_id;
  return jsonb_build_object('quote_id', p_quote_id, 'status', v_target,
    'idempotent_replay', v_quote.status = v_target);
end;
$$;

create or replace function public.quote_to_invoice(
  p_quote_id uuid,
  p_invoice_number text,
  p_due_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.get_user_company_id(auth.uid());
  v_quote public.quotes%rowtype;
  v_customer_id uuid;
  v_invoice_id uuid;
begin
  if auth.uid() is null or v_company_id is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_invoice_number, '')), '') is null then raise exception 'Invoice number is required' using errcode = '22023'; end if;
  select * into v_quote from public.quotes where id = p_quote_id and company_id = v_company_id for update;
  if not found then raise exception 'Quote not found' using errcode = 'P0002'; end if;
  if v_quote.converted_invoice_id is not null then
    return jsonb_build_object('quote_id', p_quote_id, 'invoice_id', v_quote.converted_invoice_id, 'idempotent_replay', true);
  end if;
  if v_quote.status <> 'accepted' then raise exception 'Only accepted quotes can become invoices' using errcode = '55000'; end if;

  v_customer_id := v_quote.customer_id;
  if v_customer_id is null and v_quote.deal_id is not null then
    select customer_id into v_customer_id from public.deals where id = v_quote.deal_id and company_id = v_company_id;
  end if;
  if v_customer_id is null and v_quote.lead_id is not null then
    select coalesce(converted_customer_id, case when record_type = 'customer' then id else null end)
    into v_customer_id from public.customers where id = v_quote.lead_id and company_id = v_company_id;
  end if;
  if v_customer_id is null then raise exception 'Quote has no billable customer' using errcode = '55000'; end if;

  insert into public.invoices (
    company_id, customer_id, invoice_number, amount, status, due_date, notes,
    created_by, lines, subtotal, vat_rate, vat_amount, quote_id
  ) values (
    v_company_id, v_customer_id, trim(p_invoice_number), v_quote.total, 'draft', p_due_date,
    v_quote.notes, auth.uid(), v_quote.lines, v_quote.subtotal, v_quote.vat_rate,
    v_quote.vat_amount, v_quote.id
  ) returning id into v_invoice_id;

  update public.quotes set converted_invoice_id = v_invoice_id, customer_id = v_customer_id,
    version = version + 1, updated_at = now() where id = p_quote_id;
  return jsonb_build_object('quote_id', p_quote_id, 'invoice_id', v_invoice_id, 'idempotent_replay', false);
end;
$$;

revoke all on function public.register_invoice_payment(uuid, numeric, text, timestamptz, text, text, jsonb) from public;
grant execute on function public.register_invoice_payment(uuid, numeric, text, timestamptz, text, text, jsonb) to authenticated;
revoke all on function public.void_invoice(uuid, text, integer) from public;
grant execute on function public.void_invoice(uuid, text, integer) to authenticated;
revoke all on function public.delete_draft_invoice(uuid) from public;
grant execute on function public.delete_draft_invoice(uuid) to authenticated;
revoke all on function public.transition_quote(uuid, text, integer) from public;
grant execute on function public.transition_quote(uuid, text, integer) to authenticated;
revoke all on function public.quote_to_invoice(uuid, text, date) from public;
grant execute on function public.quote_to_invoice(uuid, text, date) to authenticated;
