-- Growth OS: GA4 + Search Console data, SEO recommendations and business impact.
--
-- Model: the platform reads Google data server-side with ONE service account
-- (GOOGLE_SERVICE_ACCOUNT_JSON on the Growth OS Railway service, never in the
-- browser). A company grants that service account read access to its own GA4
-- property / Search Console site. Because any company could type another
-- company's property id, a connection starts as 'pending' and only a
-- system_admin can activate it; property ids and site URLs are unique across
-- companies. The worker syncs only 'active' connections.
--
-- Data tables are snapshots keyed by (company, day, dimensions): a re-sync
-- upserts the same keys, so nothing is counted twice. GA4 sessions and Search
-- Console clicks are stored in separate tables and never mixed.

-- ── tighten the Growth OS role helpers (same fix as the shift functions) ────
create or replace function public.growth_can_approve(_user_id uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select _user_id is not null and _user_id = auth.uid() and exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id and ur.role in ('owner', 'company_admin')
      and ur.company_id = public.get_user_company_id(_user_id))
$$;
create or replace function public.growth_can_operate(_user_id uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select _user_id is not null and _user_id = auth.uid() and exists (
    select 1 from public.user_roles ur
    where ur.user_id = _user_id and ur.role in ('owner', 'company_admin', 'manager')
      and ur.company_id = public.get_user_company_id(_user_id))
$$;
revoke all on function public.growth_can_approve(uuid), public.growth_can_operate(uuid) from public, anon;
grant execute on function public.growth_can_approve(uuid), public.growth_can_operate(uuid) to authenticated, service_role;

create or replace function public.growth_is_system_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select _user_id is not null and _user_id = auth.uid()
     and exists (select 1 from public.user_roles ur where ur.user_id = _user_id and ur.role = 'system_admin')
$$;
revoke all on function public.growth_is_system_admin(uuid) from public, anon;
grant execute on function public.growth_is_system_admin(uuid) to authenticated, service_role;

-- The SEO agent now has a second executor.
create or replace function public.growth_executable(_agent_id text, _type text)
returns boolean language sql immutable as $$
  select (_agent_id, _type) in (('seo-agent', 'seo.onpage_audit'), ('seo-agent', 'seo.opportunities'))
$$;

-- ── connections ────────────────────────────────────────────────────────────
create table if not exists public.growth_analytics_connections (
  company_id uuid primary key references public.companies(id) on delete cascade,
  ga4_property_id text unique check (ga4_property_id ~ '^[0-9]{6,12}$'),
  gsc_site_url text unique check (gsc_site_url ~ '^(sc-domain:[a-z0-9.-]+|https?://[^\s]+/)$'),
  status text not null default 'pending' check (status in ('pending','active','no_access','error','disabled')),
  requested_by uuid,
  requested_at timestamptz not null default now(),
  approved_by uuid,
  approved_at timestamptz,
  ga4_synced_through date,
  gsc_synced_through date,
  last_sync_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  check (ga4_property_id is not null or gsc_site_url is not null)
);

-- ── GA4 snapshots ──────────────────────────────────────────────────────────
create table if not exists public.growth_ga4_daily (
  company_id uuid not null references public.companies(id) on delete cascade,
  day date not null,
  channel_group text not null,          -- GA4 sessionDefaultChannelGroup, e.g. 'Organic Search'
  sessions integer not null check (sessions >= 0),
  active_users integer not null check (active_users >= 0),
  engaged_sessions integer not null check (engaged_sessions >= 0),
  key_events numeric not null check (key_events >= 0),
  synced_at timestamptz not null default now(),
  primary key (company_id, day, channel_group)
);

create table if not exists public.growth_ga4_landing_daily (
  company_id uuid not null references public.companies(id) on delete cascade,
  day date not null,
  landing_page text not null,
  channel_group text not null,
  sessions integer not null check (sessions >= 0),
  engaged_sessions integer not null check (engaged_sessions >= 0),
  key_events numeric not null check (key_events >= 0),
  synced_at timestamptz not null default now(),
  primary key (company_id, day, landing_page, channel_group)
);

-- ── Search Console snapshots (clicks are not sessions) ──────────────────────
create table if not exists public.growth_gsc_daily (
  company_id uuid not null references public.companies(id) on delete cascade,
  day date not null,
  clicks integer not null check (clicks >= 0),
  impressions integer not null check (impressions >= 0),
  ctr numeric not null,
  position numeric not null,
  synced_at timestamptz not null default now(),
  primary key (company_id, day)
);

-- Query/page rows omit anonymised queries, so they do not add up to the daily totals above.
create table if not exists public.growth_gsc_query_page_daily (
  company_id uuid not null references public.companies(id) on delete cascade,
  day date not null,
  query text not null,
  page text not null,
  clicks integer not null check (clicks >= 0),
  impressions integer not null check (impressions >= 0),
  ctr numeric not null,
  position numeric not null,
  synced_at timestamptz not null default now(),
  primary key (company_id, day, query, page)
);
create index if not exists growth_gsc_qp_company_day on public.growth_gsc_query_page_daily (company_id, day);

-- ── SEO recommendations (proposal → approval → implemented → measured) ─────
create table if not exists public.growth_seo_recommendations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid references public.growth_tasks(id) on delete set null,
  fingerprint text not null,            -- kind + target; one open recommendation per fingerprint
  kind text not null check (kind in ('ctr_gap','traffic_drop','no_key_events','striking_distance')),
  target text not null,                 -- page URL or query
  problem text not null,
  evidence jsonb not null,              -- the numbers it is based on, with period and source
  action text not null,
  priority smallint not null check (priority between 1 and 3),
  expected_effect text not null,        -- always phrased as an estimate with its uncertainty
  status text not null default 'proposed' check (status in ('proposed','approved','rejected','implemented','measured')),
  decided_by uuid, decided_at timestamptz, decision_reason text,
  implemented_on date,
  baseline jsonb,                       -- 28 days before implemented_on
  outcome jsonb,                        -- 28 days after, labelled correlation not causation
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists growth_seo_rec_open_fp on public.growth_seo_recommendations (company_id, fingerprint)
  where status in ('proposed','approved','implemented');

-- ── RLS: members read their own company; writes via RPC or the service role ─
do $$
declare t text;
begin
  foreach t in array array['growth_analytics_connections','growth_ga4_daily','growth_ga4_landing_daily','growth_gsc_daily',
                           'growth_gsc_query_page_daily','growth_seo_recommendations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "growth members read own company" on public.%I', t);
    execute format('create policy "growth members read own company" on public.%I for select to authenticated using (company_id = public.get_user_company_id(auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
-- A system_admin also sees pending connections of every company, to approve them.
drop policy if exists "growth system admin reads connections" on public.growth_analytics_connections;
create policy "growth system admin reads connections" on public.growth_analytics_connections for select to authenticated
  using (public.growth_is_system_admin(auth.uid()));

-- ── RPCs ───────────────────────────────────────────────────────────────────
-- Owner/company_admin asks to connect their own GA4 property and/or Search Console site.
create or replace function public.growth_request_analytics_connection(_ga4_property_id text, _gsc_site_url text)
returns text language plpgsql security definer set search_path to '' as $$
declare _company uuid := public.get_user_company_id(auth.uid());
        _ga4 text := nullif(trim(_ga4_property_id), '');
        _gsc text := nullif(trim(_gsc_site_url), '');
begin
  if not public.growth_can_approve(auth.uid()) then raise exception 'only owner or company_admin may connect analytics' using errcode = '42501'; end if;
  if _ga4 is null and _gsc is null then raise exception 'give a GA4 property id or a Search Console site' using errcode = '22023'; end if;
  if _ga4 is not null and _ga4 !~ '^[0-9]{6,12}$' then raise exception 'GA4 property id must be digits only (Admin → Property details)' using errcode = '22023'; end if;
  if _gsc is not null and _gsc !~ '^(sc-domain:[a-z0-9.-]+|https?://[^\s]+/)$' then raise exception 'Search Console site must be sc-domain:example.com or https://example.com/' using errcode = '22023'; end if;
  if exists (select 1 from public.growth_analytics_connections c where c.company_id <> _company and (c.ga4_property_id = _ga4 or c.gsc_site_url = _gsc)) then
    raise exception 'this property or site is already connected to another workspace' using errcode = '23505';
  end if;
  insert into public.growth_analytics_connections (company_id, ga4_property_id, gsc_site_url, status, requested_by, requested_at, approved_by, approved_at, last_error, updated_at)
  values (_company, _ga4, _gsc, 'pending', auth.uid(), now(), null, null, null, now())
  on conflict (company_id) do update set ga4_property_id = excluded.ga4_property_id, gsc_site_url = excluded.gsc_site_url,
    status = 'pending', requested_by = excluded.requested_by, requested_at = now(), approved_by = null, approved_at = null,
    ga4_synced_through = null, gsc_synced_through = null, last_error = null, updated_at = now();
  insert into public.growth_audit_log (company_id, actor_type, actor_id, event, detail)
  values (_company, 'user', auth.uid()::text, 'analytics.connection_requested', jsonb_build_object('ga4_property_id', _ga4, 'gsc_site_url', _gsc));
  return 'pending';
end $$;

-- Only a system_admin activates (or disables) a connection, after checking the property belongs to that company.
create or replace function public.growth_set_analytics_connection_status(_company_id uuid, _status text)
returns text language plpgsql security definer set search_path to '' as $$
begin
  if not public.growth_is_system_admin(auth.uid()) then raise exception 'only a system admin may activate analytics connections' using errcode = '42501'; end if;
  if _status not in ('active','disabled') then raise exception 'status must be active or disabled' using errcode = '22023'; end if;
  update public.growth_analytics_connections
     set status = _status, approved_by = auth.uid(), approved_at = now(), last_error = null, updated_at = now()
   where company_id = _company_id;
  if not found then raise exception 'no connection for that company' using errcode = 'P0002'; end if;
  insert into public.growth_audit_log (company_id, actor_type, actor_id, event, detail)
  values (_company_id, 'user', auth.uid()::text, 'analytics.connection_' || _status, '{}'::jsonb);
  return _status;
end $$;

create or replace function public.growth_decide_recommendation(_id uuid, _approve boolean, _reason text default null)
returns text language plpgsql security definer set search_path to '' as $$
declare r public.growth_seo_recommendations;
begin
  select * into r from public.growth_seo_recommendations where id = _id for update;
  if not found or r.company_id is distinct from public.get_user_company_id(auth.uid()) then raise exception 'recommendation not found' using errcode = 'P0002'; end if;
  if not public.growth_can_approve(auth.uid()) then raise exception 'only owner or company_admin may decide' using errcode = '42501'; end if;
  if r.status <> 'proposed' then raise exception 'recommendation is %', r.status using errcode = '22023'; end if;
  update public.growth_seo_recommendations set status = case when _approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), decision_reason = left(_reason, 1000), updated_at = now() where id = _id;
  insert into public.growth_audit_log (company_id, actor_type, actor_id, event, subject_id, detail)
  values (r.company_id, 'user', auth.uid()::text, case when _approve then 'seo_rec.approved' else 'seo_rec.rejected' end, _id::text, jsonb_build_object('kind', r.kind, 'target', r.target));
  return case when _approve then 'approved' else 'rejected' end;
end $$;

-- A human marks an approved recommendation as done (the agent never publishes content itself).
create or replace function public.growth_mark_recommendation_implemented(_id uuid, _implemented_on date)
returns text language plpgsql security definer set search_path to '' as $$
declare r public.growth_seo_recommendations;
begin
  select * into r from public.growth_seo_recommendations where id = _id for update;
  if not found or r.company_id is distinct from public.get_user_company_id(auth.uid()) then raise exception 'recommendation not found' using errcode = 'P0002'; end if;
  if not public.growth_can_operate(auth.uid()) then raise exception 'only owner, company_admin or manager' using errcode = '42501'; end if;
  if r.status <> 'approved' then raise exception 'only approved recommendations can be marked implemented' using errcode = '22023'; end if;
  if _implemented_on is null or _implemented_on > current_date or _implemented_on < r.created_at::date then raise exception 'implementation date must be between the proposal and today' using errcode = '22023'; end if;
  update public.growth_seo_recommendations set status = 'implemented', implemented_on = _implemented_on, updated_at = now() where id = _id;
  insert into public.growth_audit_log (company_id, actor_type, actor_id, event, subject_id, detail)
  values (r.company_id, 'user', auth.uid()::text, 'seo_rec.implemented', _id::text, jsonb_build_object('implemented_on', _implemented_on));
  return 'implemented';
end $$;

-- Business impact from the company's own CRM. Leads count as organic only when their
-- acquisition_source says so; untracked leads are reported as such, never guessed.
create or replace function public.growth_business_impact(_from date, _to date)
returns jsonb language sql stable security definer set search_path to '' as $$
  with c as (
    select cu.id, cu.record_type, cu.status::text as status, cu.converted_at, cu.created_at,
           lower(coalesce(cu.acquisition_source, cu.lead_source, '')) as src
    from public.customers cu
    where cu.company_id = public.get_user_company_id(auth.uid())
      and cu.created_at >= _from and cu.created_at < _to + 1
  ), paid as (
    select inv.customer_id, sum(inv.amount) as amount
    from public.invoices inv
    where inv.company_id = public.get_user_company_id(auth.uid()) and inv.status::text = 'paid'
      and inv.paid_at >= _from and inv.paid_at < _to + 1 and inv.customer_id is not null
    group by inv.customer_id
  )
  select case when auth.uid() is null or public.get_user_company_id(auth.uid()) is null then null else jsonb_build_object(
    'leads_total', (select count(*) from c where record_type = 'lead'),
    'leads_without_source', (select count(*) from c where record_type = 'lead' and src = ''),
    'leads_organic', (select count(*) from c where record_type = 'lead' and src in ('organic','organic_search','seo','google_organic')),
    'leads_organic_converted', (select count(*) from c where record_type = 'lead' and src in ('organic','organic_search','seo','google_organic') and (status = 'customer' or converted_at is not null)),
    'paying_customers_total', (select count(*) from paid),
    'paying_customers_organic', (select count(*) from paid p join public.customers cu on cu.id = p.customer_id
                                 where lower(coalesce(cu.acquisition_source, cu.lead_source, '')) in ('organic','organic_search','seo','google_organic')),
    'revenue_organic', (select coalesce(sum(p.amount), 0) from paid p join public.customers cu on cu.id = p.customer_id
                        where lower(coalesce(cu.acquisition_source, cu.lead_source, '')) in ('organic','organic_search','seo','google_organic'))
  ) end
$$;

revoke all on function public.growth_request_analytics_connection(text, text), public.growth_set_analytics_connection_status(uuid, text),
  public.growth_decide_recommendation(uuid, boolean, text), public.growth_mark_recommendation_implemented(uuid, date),
  public.growth_business_impact(date, date) from public, anon;
grant execute on function public.growth_request_analytics_connection(text, text), public.growth_set_analytics_connection_status(uuid, text),
  public.growth_decide_recommendation(uuid, boolean, text), public.growth_mark_recommendation_implemented(uuid, date),
  public.growth_business_impact(date, date) to authenticated;
