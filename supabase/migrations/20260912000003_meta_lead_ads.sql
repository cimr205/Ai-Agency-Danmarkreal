-- Phase 2, Flow 1: Meta lead ads -> CRM -> sales.
--
-- Confirmed before writing this migration: only Meta ad/campaign performance
-- sync exists today (meta-sync, meta_campaigns/meta_ad_sets/meta_ads/etc,
-- all from 20260901000005_meta_ads_sync.sql). There is no `leadgen` webhook
-- receiver anywhere, no Page model (Lead Ads webhooks are keyed by Facebook
-- Page ID, not ad account ID), and no lead-attribution columns on
-- `customers`. customers.source_id/campaign_id exist but are documented as
-- "free-standing, no FK target" placeholders from the lead-gen-session/ad
-- work — campaign_id can now legitimately point at meta_campaigns.id since
-- that table exists, so this migration uses it rather than adding a
-- redundant column.
--
-- Also fixes a real bug found while tracing this: tr_lead_event_ins/upd
-- (baseline_triggers.sql) are bound to the legacy `public.leads` table,
-- which nothing writes to anymore (CSV import and this new ingestion path
-- both insert into `customers` with record_type = 'lead'). That means
-- lead.created never fires today. This migration adds the equivalent
-- trigger on `customers`, which the Meta ingestion RPC below - and every
-- other current lead-creation path - depends on for the workflow engine to
-- react to new leads at all.

-- ── A. Fix dead lead.created/lead.status_changed event trigger ─────────

create or replace function public.trg_emit_customer_lead_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  begin
    if NEW.record_type <> 'lead' then
      return NEW;
    end if;

    if TG_OP = 'INSERT' then
      perform emit_workspace_event(NEW.company_id, 'lead.created', 'crm', 'lead', NEW.id::text,
        jsonb_build_object('name', NEW.name, 'email', NEW.email, 'company', NEW.company_name,
          'score', NEW.score, 'status', NEW.status::text, 'lead_source', NEW.lead_source),
        coalesce(auth.uid(), NEW.created_by));
    elsif TG_OP = 'UPDATE' and OLD.status is distinct from NEW.status then
      perform emit_workspace_event(NEW.company_id, 'lead.status_changed', 'crm', 'lead', NEW.id::text,
        jsonb_build_object('from', OLD.status::text, 'to', NEW.status::text, 'name', NEW.name), auth.uid());
    end if;
  exception when others then null;
  end;
  return NEW;
end;
$$;

create trigger tr_customer_lead_event_ins
after insert on public.customers
for each row execute function public.trg_emit_customer_lead_event();

create trigger tr_customer_lead_event_upd
after update on public.customers
for each row execute function public.trg_emit_customer_lead_event();

-- ── B. Attribution columns on customers ─────────────────────────────────

alter table public.customers
  add column if not exists lead_source text,
  add column if not exists meta_leadgen_id text;

comment on column public.customers.lead_source is
  'Origin platform, e.g. meta_ads, manual, csv_import, scraper. Nullable for pre-existing rows.';
comment on column public.customers.meta_leadgen_id is
  'Meta''s globally-unique lead id, when the lead originated from a Meta Lead Ads form.';

create unique index if not exists customers_meta_leadgen_id_unique
  on public.customers (meta_leadgen_id)
  where meta_leadgen_id is not null;

-- ── C. Page model (Lead Ads webhooks are keyed by Page ID) ──────────────

create table public.meta_pages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  meta_connection_id uuid not null references public.meta_connections(id) on delete cascade,
  page_id text not null,
  page_name text,
  page_access_token_ciphertext text,
  page_token_iv text,
  leadgen_subscribed boolean not null default false,
  leadgen_subscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (page_id)
);

comment on column public.meta_pages.page_id is
  'Facebook Page ID. Globally unique per Meta, so this is the join key from an incoming leadgen webhook back to a company.';

create index meta_pages_company_idx on public.meta_pages (company_id);

alter table public.meta_pages enable row level security;

create policy "Company members read Meta pages" on public.meta_pages
  for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()));

-- Page tokens are server-only, same pattern as meta_connections.access_token.
revoke select on public.meta_pages from anon, authenticated;
grant select (id, company_id, meta_connection_id, page_id, page_name, leadgen_subscribed, leadgen_subscribed_at, created_at, updated_at)
  on public.meta_pages to authenticated;

-- ── D. Raw webhook staging (idempotency + audit trail) ──────────────────

create table public.meta_leadgen_events (
  id uuid primary key default gen_random_uuid(),
  meta_leadgen_id text not null unique,
  meta_page_id text not null,
  meta_form_id text,
  meta_ad_id text,
  meta_adset_id text,
  meta_campaign_id text,
  company_id uuid references public.companies(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  status text not null default 'received' check (status in ('received', 'processed', 'failed', 'skipped_unmatched_page')),
  error text,
  raw jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

comment on constraint meta_leadgen_events_meta_leadgen_id_key on public.meta_leadgen_events is
  'Meta''s leadgen id is globally unique per lead submission - this is the idempotency guarantee against duplicate/replayed webhook deliveries.';

create index meta_leadgen_events_company_idx on public.meta_leadgen_events (company_id, received_at desc);

alter table public.meta_leadgen_events enable row level security;

create policy "Company members read their Meta leadgen events" on public.meta_leadgen_events
  for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()));

-- ── E. Ingestion RPC (called by the meta-leadgen-webhook edge function using the service role) ──

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
  -- Idempotency: a duplicate/replayed webhook for the same lead is a clean no-op.
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

    -- Same advisory-lock-on-identity pattern as convert_lead_to_deal, so two
    -- concurrent leads for the same person can never race through find-or-create.
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
        (
          select p.user_id from public.profiles p
          join public.user_roles ur on ur.user_id = p.user_id
          where p.company_id = v_company_id and ur.role in ('system_admin', 'company_admin')
          order by p.created_at
          limit 1
        ),
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
