-- Phase 2 follow-up, item 1: real Stripe Checkout Session creation for
-- tenant invoices.
--
-- The webhook side (register_invoice_payment_service) already existed, but
-- nothing created a Stripe Checkout Session carrying an invoice reference —
-- create-invoice-checkout-session (new edge function) closes that.
--
-- Design: the checkout-creation call is authenticated (a company's staff
-- member generates a payment link for one of their own invoices from the
-- Invoices UI) and verifies server-side that the invoice actually belongs
-- to the caller's own company (resolved via auth.uid() -> profiles, never
-- trusting a client-supplied company_id). Once verified, this table stores
-- an opaque reference row; Stripe's checkout session metadata carries only
-- `payment_reference` (this row's id) — never invoice_id or company_id
-- directly — so tenant/internal identifiers never appear in Stripe's
-- dashboard or webhook payloads. stripe-webhook resolves payment_reference
-- back to invoice_id/company_id through this table (a value it wrote
-- itself), rather than trusting anything client- or Stripe-supplied for
-- ownership.

create table public.invoice_payment_references (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  amount numeric(15,2) not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'expired', 'cancelled')),
  stripe_checkout_session_id text,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  consumed_at timestamptz
);

comment on table public.invoice_payment_references is
  'Opaque payment-link references: id is the only thing placed in Stripe Checkout Session metadata (as payment_reference), so Stripe never sees invoice_id/company_id directly, and the webhook resolves ownership through this table rather than trusting client/Stripe-supplied ids.';

create index invoice_payment_references_invoice_idx on public.invoice_payment_references (invoice_id);
create index invoice_payment_references_company_idx on public.invoice_payment_references (company_id);

alter table public.invoice_payment_references enable row level security;

create policy "Company members can view their invoice payment references" on public.invoice_payment_references
  for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()));

-- Creation happens only through create-invoice-checkout-session (service
-- role, after its own server-side ownership check) — no direct
-- insert/update policy for regular users.

-- Resolves an opaque payment_reference (from Stripe webhook metadata) back
-- to its invoice/company, only if still pending and not expired. Marks it
-- consumed in the same statement it's resolved, so a reference can't be
-- replayed to trigger a second payment attempt through this path (the
-- actual payment idempotency is still register_invoice_payment_service's
-- job, keyed on the Stripe event id — this is a second, independent guard
-- specific to the reference itself).
create or replace function public.resolve_invoice_payment_reference(p_reference_id uuid)
returns table (invoice_id uuid, company_id uuid, amount numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.invoice_payment_references%rowtype;
begin
  select * into v_row
  from public.invoice_payment_references
  where id = p_reference_id
  for update;

  if not found then
    return;
  end if;

  if v_row.status = 'pending' and v_row.expires_at > now() then
    update public.invoice_payment_references
    set status = 'completed', consumed_at = now()
    where id = p_reference_id;
  end if;

  return query select v_row.invoice_id, v_row.company_id, v_row.amount;
end;
$$;

revoke all on function public.resolve_invoice_payment_reference(uuid) from public;
grant execute on function public.resolve_invoice_payment_reference(uuid) to service_role;
revoke execute on function public.resolve_invoice_payment_reference(uuid) from anon, authenticated;

-- Creates the reference row after the caller has already verified the
-- invoice belongs to their company (create-invoice-checkout-session does
-- that check itself before calling this) — but this RPC re-verifies
-- ownership independently rather than trusting the edge function's word
-- for it, since it's the actual write path.
create or replace function public.create_invoice_payment_reference(p_invoice_id uuid)
returns table (id uuid, amount numeric)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_company_id uuid := get_user_company_id(auth.uid());
  v_invoice public.invoices%rowtype;
  v_paid numeric;
  v_remaining numeric;
  v_reference_id uuid;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_invoice
  from public.invoices
  where invoices.id = p_invoice_id and invoices.company_id = v_company_id;

  if not found then
    raise exception 'Invoice not found for this company' using errcode = 'P0002';
  end if;

  if v_invoice.status in ('paid', 'cancelled') or v_invoice.voided_at is not null then
    raise exception 'Invoice is not payable' using errcode = '55000';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where invoice_id = p_invoice_id and company_id = v_company_id
    and status = 'completed' and reversed_at is null;
  v_remaining := v_invoice.amount - v_paid;
  if v_remaining <= 0 then
    raise exception 'Invoice has no remaining balance' using errcode = '55000';
  end if;

  insert into public.invoice_payment_references (invoice_id, company_id, amount, created_by)
  values (p_invoice_id, v_company_id, v_remaining, auth.uid())
  returning invoice_payment_references.id into v_reference_id;

  return query select v_reference_id, v_remaining;
end;
$$;

revoke all on function public.create_invoice_payment_reference(uuid) from public;
grant execute on function public.create_invoice_payment_reference(uuid) to authenticated;
revoke execute on function public.create_invoice_payment_reference(uuid) from anon;
