-- Epic 1: atomic lead→customer→deal conversion + contact dedup.
--
-- Root problem this fixes (confirmed in code before writing this migration,
-- not assumed): two separate, incomplete client-side flows exist today.
-- useConvertLeadToCustomer (src/hooks/api/useLeads.ts) does two sequential
-- browser calls (insert customers row, then update lead status) and never
-- creates a deal. LeadDetailPanel.handleConvertToDeal does two sequential
-- browser calls (create deal, then update lead status) and never creates a
-- customer row — so the created deal's customer_id is left null, a real
-- orphan-deal bug. Neither flow calls the other. A double-click, a slow
-- network, or a refresh mid-flow can leave a lead in a half-converted
-- state, or create two deals / two customers for the same lead.
--
-- The leads/customers merge itself already shipped in an earlier pass
-- (customers.record_type + converted_from_lead_id already exist) — this
-- migration does not repeat that work, it fixes the conversion path on top
-- of it.

-- ── A. Normalized identity fields ──────────────────────────────────────

alter table public.customers
  add column if not exists normalized_email text
    generated always as (nullif(lower(trim(email)), '')) stored,
  add column if not exists normalized_phone text,
  add column if not exists converted_deal_id uuid references public.deals(id) on delete set null,
  add column if not exists converted_at timestamptz,
  add column if not exists conversion_status text not null default 'none'
    check (conversion_status in ('none', 'converted')),
  add column if not exists source_id uuid,
  add column if not exists campaign_id uuid;

comment on column public.customers.source_id is
  'Free-standing reference, no FK target exists yet (lead-gen sessions are not a referenceable table in this schema). Intentional — do not fabricate a foreign key to a table that does not model this concept.';
comment on column public.customers.campaign_id is
  'Free-standing reference, no FK target exists yet (ad campaigns are not a referenceable table in this schema). Intentional, same reasoning as source_id.';

-- Phone normalization can't be a generated column (needs conditional
-- country-code logic), so it's maintained by a trigger instead. Danish
-- context: an 8-digit local number is assumed Danish and gets +45; numbers
-- that already look international (start with + or 00) are normalized to
-- E.164 shape; anything that doesn't parse cleanly is left untouched
-- rather than guessed at, so a bad number can never silently collide with
-- a different bad number under a fabricated normalization.
create or replace function public.normalize_phone_number(p_phone text)
returns text
language plpgsql
immutable
as $$
declare
  digits text;
begin
  if p_phone is null or trim(p_phone) = '' then
    return null;
  end if;

  digits := regexp_replace(p_phone, '[^0-9+]', '', 'g');

  if digits ~ '^\+[0-9]{8,15}$' then
    return digits;
  end if;

  if digits ~ '^00[0-9]{8,15}$' then
    return '+' || substring(digits from 3);
  end if;

  if digits ~ '^[0-9]{8}$' then
    return '+45' || digits;
  end if;

  -- Doesn't match a recognized shape — return null rather than a guess,
  -- so it never participates in dedup matching.
  return null;
end;
$$;

create or replace function public.customers_set_normalized_phone()
returns trigger
language plpgsql
as $$
begin
  new.normalized_phone := public.normalize_phone_number(new.phone);
  return new;
end;
$$;

drop trigger if exists trg_customers_normalize_phone on public.customers;
create trigger trg_customers_normalize_phone
  before insert or update of phone on public.customers
  for each row execute function public.customers_set_normalized_phone();

-- Backfill existing rows once (trigger only fires on future insert/update).
update public.customers
set normalized_phone = public.normalize_phone_number(phone)
where phone is not null and normalized_phone is null;

-- ── B. Workspace-isolated uniqueness ───────────────────────────────────
-- Scoped to record_type = 'customer' only. Leads legitimately share a
-- generic inbox (info@firma.dk) before they're qualified — enforcing
-- uniqueness there would silently reject real lead capture, not just
-- dedupe it. Partial index also skips null normalized_email so empty
-- values never collide with each other.
create unique index if not exists customers_company_normalized_email_unique
  on public.customers (company_id, normalized_email)
  where record_type = 'customer' and normalized_email is not null;

create index if not exists customers_normalized_phone_idx
  on public.customers (company_id, normalized_phone)
  where normalized_phone is not null;

create index if not exists customers_record_type_company_idx
  on public.customers (company_id, record_type);

-- ── D. Dedupe preview (read-only) ──────────────────────────────────────
create or replace function public.find_contact_duplicates(
  p_email text,
  p_phone text,
  p_workspace_id uuid
)
returns table (
  match_type text,
  confidence text,
  customer_id uuid,
  record_type text,
  name text,
  email text,
  phone text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_company_id uuid;
  v_norm_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_norm_phone text := public.normalize_phone_number(p_phone);
begin
  v_company_id := public.get_user_company_id(auth.uid());
  if v_company_id is null or v_company_id <> p_workspace_id then
    raise exception 'Not authorized for this workspace' using errcode = '42501';
  end if;

  if v_norm_email is null and v_norm_phone is null then
    return;
  end if;

  return query
  select
    case when c.normalized_email = v_norm_email and c.normalized_phone = v_norm_phone then 'both'
         when c.normalized_email = v_norm_email then 'email'
         else 'phone' end as match_type,
    case when c.normalized_email = v_norm_email and c.normalized_phone = v_norm_phone then 'high'
         when c.normalized_email = v_norm_email then 'high'
         else 'medium' end as confidence,
    c.id as customer_id,
    c.record_type,
    c.name,
    c.email,
    c.phone
  from public.customers c
  where c.company_id = v_company_id
    and (
      (v_norm_email is not null and c.normalized_email = v_norm_email)
      or (v_norm_phone is not null and c.normalized_phone = v_norm_phone)
    )
  order by match_type = 'both' desc, c.created_at desc
  limit 20;
end;
$$;

grant execute on function public.find_contact_duplicates(text, text, uuid) to authenticated;

-- ── C. Atomic conversion RPC ────────────────────────────────────────────
create or replace function public.convert_lead_to_deal(
  p_lead_id uuid,
  p_deal_name text,
  p_pipeline_stage_id uuid default null,
  p_value numeric default null,
  p_currency text default 'DKK'
)
returns table (
  lead_id uuid,
  customer_id uuid,
  deal_id uuid,
  dedupe_result text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_user_id uuid := auth.uid();
  v_lead record;
  v_customer_id uuid;
  v_deal_id uuid;
  v_dedupe text := 'created';
  v_norm_email text;
  v_norm_phone text;
  v_stage text;
begin
  v_company_id := public.get_user_company_id(v_user_id);
  if v_company_id is null then
    raise exception 'No company associated with caller' using errcode = '42501';
  end if;

  -- Lock the lead row for the duration of this transaction — a concurrent
  -- second call for the same lead blocks here until the first commits,
  -- then hits the "already converted" branch below instead of racing it.
  select * into v_lead
  from public.customers
  where id = p_lead_id
    and company_id = v_company_id
    and record_type = 'lead'
  for update;

  if not found then
    raise exception 'Lead not found for this company' using errcode = 'P0002';
  end if;

  -- Idempotent: a repeated call (double-click, retried request) returns
  -- the original result unchanged instead of creating a second customer
  -- or deal.
  if v_lead.conversion_status = 'converted' then
    -- Re-derive customer_id: the lead itself isn't the customer row: find
    -- the customer created from it, if any, else fall back to null-safe.
    select c.id into v_customer_id
    from public.customers c
    where c.converted_from_lead_id = v_lead.id
      and c.company_id = v_company_id
      and c.record_type = 'customer'
    limit 1;

    return query select v_lead.id, v_customer_id, v_lead.converted_deal_id, 'already_converted'::text;
    return;
  end if;

  v_norm_email := nullif(lower(trim(coalesce(v_lead.email, ''))), '');
  v_norm_phone := public.normalize_phone_number(v_lead.phone);

  -- Find-or-create the customer, matched by normalized email first, then
  -- phone, within this tenant only.
  if v_norm_email is not null then
    select c.id into v_customer_id
    from public.customers c
    where c.company_id = v_company_id
      and c.record_type = 'customer'
      and c.normalized_email = v_norm_email
    limit 1;
  end if;

  if v_customer_id is null and v_norm_phone is not null then
    select c.id into v_customer_id
    from public.customers c
    where c.company_id = v_company_id
      and c.record_type = 'customer'
      and c.normalized_phone = v_norm_phone
    limit 1;
  end if;

  if v_customer_id is not null then
    v_dedupe := 'matched_existing';
  else
    insert into public.customers (
      company_id, created_by, name, email, phone, address, city,
      company_name, industry, record_type, converted_from_lead_id,
      currency, source_id, campaign_id
    )
    values (
      v_company_id, v_user_id,
      coalesce(v_lead.company_name, v_lead.name), v_lead.email, v_lead.phone,
      v_lead.address, v_lead.city, v_lead.company_name, v_lead.industry,
      'customer', v_lead.id,
      coalesce(p_currency, v_lead.currency, 'DKK'), v_lead.source_id, v_lead.campaign_id
    )
    returning id into v_customer_id;
    v_dedupe := 'created';
  end if;

  -- deals.stage is a free-text column in this schema (no pipeline_stages
  -- table exists) — p_pipeline_stage_id is accepted for signature
  -- compatibility but there is nothing to look up; caller-supplied stage
  -- text isn't part of this RPC's signature, so default to the same
  -- 'discovery' stage the client-side flow already used.
  v_stage := 'discovery';

  insert into public.deals (
    company_id, created_by, customer_id, title, value, stage, notes
  )
  values (
    v_company_id, v_user_id, v_customer_id,
    coalesce(p_deal_name, 'Deal: ' || v_lead.name),
    coalesce(p_value, v_lead.value, 0),
    v_stage,
    'Converted from lead: ' || v_lead.name || E'\nEmail: ' || coalesce(v_lead.email, 'N/A') || E'\nPhone: ' || coalesce(v_lead.phone, 'N/A')
  )
  returning id into v_deal_id;

  update public.customers
  set status = 'customer',
      conversion_status = 'converted',
      converted_deal_id = v_deal_id,
      converted_at = now()
  where id = v_lead.id;

  insert into public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description, metadata)
  values (
    v_user_id, v_company_id, 'lead_converted', 'lead', v_lead.id,
    'Lead "' || v_lead.name || '" converted to deal',
    jsonb_build_object('customer_id', v_customer_id, 'deal_id', v_deal_id, 'dedupe_result', v_dedupe)
  );

  return query select v_lead.id, v_customer_id, v_deal_id, v_dedupe;
end;
$$;

grant execute on function public.convert_lead_to_deal(uuid, text, uuid, numeric, text) to authenticated;
