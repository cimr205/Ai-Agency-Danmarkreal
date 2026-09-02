-- Epic 4: server-owned Meta credentials and normalized Marketing API data.

alter table public.meta_connections
  alter column access_token drop not null,
  add column if not exists access_token_ciphertext text,
  add column if not exists token_iv text,
  add column if not exists token_key_version integer not null default 1,
  add column if not exists granted_scopes text[],
  add column if not exists last_sync_at timestamptz,
  add column if not exists sync_status text not null default 'idle',
  add column if not exists sync_error text,
  add column if not exists token_refreshed_at timestamptz;

-- Existing plaintext browser-readable tokens cannot be migrated safely in SQL
-- because the encryption key is deliberately available only to Edge Functions.
-- Force a one-time reconnect and eliminate the secret from browser-readable data.
update public.meta_connections
set status = 'reconnect_required', access_token = null,
    sync_status = 'blocked', sync_error = 'Secure reconnect required'
where access_token is not null and access_token_ciphertext is null;

create table if not exists public.meta_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  meta_campaign_id text not null,
  name text not null,
  objective text,
  status text,
  effective_status text,
  daily_budget numeric,
  lifetime_budget numeric,
  start_time timestamptz,
  stop_time timestamptz,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (company_id, meta_campaign_id)
);

create table if not exists public.meta_ad_sets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  campaign_id uuid references public.meta_campaigns(id) on delete cascade,
  meta_ad_set_id text not null,
  meta_campaign_id text not null,
  name text not null,
  status text,
  effective_status text,
  optimization_goal text,
  daily_budget numeric,
  lifetime_budget numeric,
  targeting jsonb,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (company_id, meta_ad_set_id)
);

create table if not exists public.meta_creatives (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  meta_creative_id text not null,
  name text,
  title text,
  body text,
  image_url text,
  thumbnail_url text,
  object_story_spec jsonb,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (company_id, meta_creative_id)
);

create table if not exists public.meta_ads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  campaign_id uuid references public.meta_campaigns(id) on delete cascade,
  ad_set_id uuid references public.meta_ad_sets(id) on delete cascade,
  creative_id uuid references public.meta_creatives(id) on delete set null,
  meta_ad_id text not null,
  meta_campaign_id text,
  meta_ad_set_id text,
  meta_creative_id text,
  name text not null,
  status text,
  effective_status text,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (company_id, meta_ad_id)
);

create table if not exists public.meta_daily_insights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  insight_date date not null,
  level text not null check (level in ('account','campaign','adset','ad')),
  external_object_id text not null,
  campaign_id text,
  adset_id text,
  ad_id text,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  ctr numeric not null default 0,
  cpc numeric not null default 0,
  cpm numeric not null default 0,
  actions jsonb not null default '[]'::jsonb,
  conversions numeric not null default 0,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (company_id, level, external_object_id, insight_date)
);

create table if not exists public.meta_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  requested_by uuid,
  status text not null default 'queued' check (status in ('queued','running','completed','failed','rate_limited')),
  cursor_state jsonb not null default '{}'::jsonb,
  records_synced integer not null default 0,
  retry_after timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists meta_campaigns_account_status_idx on public.meta_campaigns (ad_account_id, effective_status);
create index if not exists meta_ads_account_status_idx on public.meta_ads (ad_account_id, effective_status);
create index if not exists meta_insights_account_date_idx on public.meta_daily_insights (ad_account_id, insight_date desc);
create index if not exists meta_sync_jobs_company_time_idx on public.meta_sync_jobs (company_id, created_at desc);

alter table public.meta_campaigns enable row level security;
alter table public.meta_ad_sets enable row level security;
alter table public.meta_creatives enable row level security;
alter table public.meta_ads enable row level security;
alter table public.meta_daily_insights enable row level security;
alter table public.meta_sync_jobs enable row level security;

create policy "Company members read Meta campaigns" on public.meta_campaigns for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()));
create policy "Company members read Meta ad sets" on public.meta_ad_sets for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()));
create policy "Company members read Meta creatives" on public.meta_creatives for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()));
create policy "Company members read Meta ads" on public.meta_ads for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()));
create policy "Company members read Meta insights" on public.meta_daily_insights for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()));
create policy "Company members read Meta sync jobs" on public.meta_sync_jobs for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()));

create or replace function public.get_meta_connection_status()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((
    select jsonb_build_object(
      'id', c.id,
      'status', c.status,
      'meta_user_id', c.meta_user_id,
      'meta_user_name', c.meta_user_name,
      'connected_at', c.connected_at,
      'token_expires_at', c.token_expires_at,
      'last_sync_at', c.last_sync_at,
      'sync_status', c.sync_status,
      'sync_error', c.sync_error,
      'ad_accounts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id, 'account_id', a.account_id, 'account_name', a.account_name,
          'business_name', a.business_name, 'currency', a.currency,
          'account_status', a.account_status
        ) order by a.account_name)
        from public.meta_ad_accounts a where a.company_id = c.company_id
      ), '[]'::jsonb)
    )
    from public.meta_connections c
    where c.company_id = public.get_user_company_id(auth.uid())
  ), jsonb_build_object('status', 'disconnected', 'ad_accounts', '[]'::jsonb));
$$;

-- OAuth ciphertext is server-only. The browser uses get_meta_connection_status().
revoke select on public.meta_connections from anon, authenticated;

revoke all on function public.get_meta_connection_status() from public;
grant execute on function public.get_meta_connection_status() to authenticated;
