-- Phase 2, Flow 4: payment -> finance -> customer state.
--
-- Confirmed before writing this migration: register_invoice_payment
-- (atomic_finance migration) is already a solid, atomic, idempotency-keyed
-- invoice-payment RPC — but it hard-requires auth.uid() (`if auth.uid() is
-- null or v_company_id is null then raise exception 'Not authorized'`),
-- because it's designed for the authenticated frontend flow
-- (useFinance.ts useCreatePayment). A service-role webhook call has no
-- auth.uid(), so it would always be rejected by that function as written.
--
-- Also confirmed: no Stripe webhook receiver exists anywhere in the repo.
-- create-checkout/customer-portal/check-subscription only handle this
-- platform's own SaaS subscription billing and never push invoice/payment
-- state anywhere.
--
-- This migration adds a webhook-safe sibling with the identical atomic
-- logic (row lock, idempotency-key replay check, balance check, invoice
-- status transition) rather than relaxing the auth check on the trusted
-- user-facing RPC. It takes company_id explicitly (safe: only service_role
-- can call it) and falls back to a company admin for created_by, the same
-- convention used by ingest_meta_lead for other system-originated writes.

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
  v_created_by uuid;
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

  select p.user_id into v_created_by
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.user_id
  where p.company_id = p_company_id and ur.role in ('system_admin', 'company_admin')
  order by p.created_at
  limit 1;

  insert into public.payments (
    company_id, invoice_id, amount, status, payment_method, paid_at, created_by,
    idempotency_key, external_reference, metadata
  ) values (
    p_company_id, p_invoice_id, p_amount, 'completed', nullif(trim(p_payment_method), ''),
    now(), v_created_by, trim(p_idempotency_key),
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
  values (v_created_by, p_company_id, 'invoice_payment_registered', 'invoice', p_invoice_id,
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
