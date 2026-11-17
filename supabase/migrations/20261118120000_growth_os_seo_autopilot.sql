-- Growth OS: SEO autopilot (moved in from the standalone ~/seo-autopilot service).
--
-- What it does, per company site, on the Growth OS Railway service:
--   1. crawl the public sitemap, run deterministic on-page checks, score each page,
--      store findings and what changed since the previous crawl (no model, free);
--   2. a planner model picks 1–3 tasks (technical audit or page draft);
--   3. a writer model drafts one task; a reviewer model scores it;
--   4. a HUMAN approves or rejects the draft. Nothing is ever published to the
--      website by the agent (content.publish is Level 3).
-- Models: only free OpenRouter models (owner decision 2026-11-17), capped per day.
--
-- Ownership: the crawled site must be on the domain of the company's ACTIVE,
-- system-admin-approved Search Console connection, so a company cannot point
-- the agent at someone else's site.

-- ── executor whitelist ─────────────────────────────────────────────────────
create or replace function public.growth_executable(_agent_id text, _type text)
returns boolean language sql immutable as $$
  select (_agent_id, _type) in (('seo-agent', 'seo.onpage_audit'), ('seo-agent', 'seo.opportunities'), ('seo-agent', 'seo.autopilot'))
$$;

-- ── site settings (one per company) ────────────────────────────────────────
create table if not exists public.growth_seo_sites (
  company_id uuid primary key references public.companies(id) on delete cascade,
  site_url text not null check (site_url ~ '^https://[a-z0-9.-]+$'),
  enabled boolean not null default true,
  crawl_every_hours smallint not null default 6 check (crawl_every_hours between 1 and 168),
  max_pages smallint not null default 60 check (max_pages between 1 and 200),
  max_pending_drafts smallint not null default 8 check (max_pending_drafts between 0 and 50),
  llm_calls_per_day smallint not null default 12 check (llm_calls_per_day between 0 and 40),
  product_facts text not null default '' check (length(product_facts) <= 4000),
  topics jsonb not null default '[]'::jsonb check (jsonb_typeof(topics) = 'array'),
  last_run_at timestamptz,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── runs, pages, findings, changes ─────────────────────────────────────────
create table if not exists public.growth_seo_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('loop', 'ga4', 'rea')),   -- ga4/rea: imported history only
  trigger text not null check (trigger in ('schedule', 'manual', 'import')),
  task_id uuid references public.growth_tasks(id) on delete set null,
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  score smallint check (score between 0 and 100),
  pages integer,
  findings integer,
  changes integer,
  llm_calls integer not null default 0,
  models text[] not null default '{}',
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  summary text,
  error text,
  log jsonb not null default '[]'::jsonb,
  legacy_id integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists growth_seo_runs_company_started on public.growth_seo_runs (company_id, started_at desc);
create unique index if not exists growth_seo_runs_legacy on public.growth_seo_runs (company_id, legacy_id) where legacy_id is not null;

create table if not exists public.growth_seo_pages (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.growth_seo_runs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  url text not null,
  status integer not null,
  ms integer, bytes integer,
  title text, meta_description text, canonical text, robots text, lang text,
  h1_count integer not null default 0,
  word_count integer not null default 0,
  json_ld text[] not null default '{}',
  internal_links integer not null default 0,
  has_og_image boolean not null default false,
  score smallint not null check (score between 0 and 100)
);
create index if not exists growth_seo_pages_run on public.growth_seo_pages (run_id);
create index if not exists growth_seo_pages_company_url on public.growth_seo_pages (company_id, url);

create table if not exists public.growth_seo_findings (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.growth_seo_runs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  url text not null,
  severity text not null check (severity in ('high', 'medium', 'low')),
  issue text not null,
  fix text not null
);
create index if not exists growth_seo_findings_run on public.growth_seo_findings (run_id);

create table if not exists public.growth_seo_changes (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.growth_seo_runs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  url text not null,
  field text not null,
  before text,
  after text
);
create index if not exists growth_seo_changes_run on public.growth_seo_changes (run_id);

-- ── tasks and drafts ───────────────────────────────────────────────────────
create table if not exists public.growth_seo_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  run_id uuid references public.growth_seo_runs(id) on delete set null,
  type text not null check (type in ('technical_audit', 'page_draft')),
  title text not null,
  target text,
  rationale text,
  priority smallint not null default 2 check (priority between 1 and 3),
  status text not null default 'open' check (status in ('open', 'done', 'failed')),
  attempts smallint not null default 0,
  error text,
  legacy_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists growth_seo_tasks_open on public.growth_seo_tasks (company_id, status, priority);
create unique index if not exists growth_seo_tasks_legacy on public.growth_seo_tasks (company_id, legacy_id) where legacy_id is not null;

-- review_* = the reviewer MODEL's verdict. decision = the HUMAN's. A model pass is
-- never an approval; only growth_seo_decide_draft() sets decision.
create table if not exists public.growth_seo_drafts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid references public.growth_seo_tasks(id) on delete set null,
  run_id uuid references public.growth_seo_runs(id) on delete set null,
  kind text not null check (kind in ('page', 'audit')),
  slug text,
  title text not null,
  meta_description text,
  h1 text,
  summary text,
  body text not null default '',
  worker_model text,
  review_model text,
  review_score smallint check (review_score between 1 and 10),
  review_notes text,
  review_status text not null default 'pending' check (review_status in ('pending', 'passed', 'failed')),
  decision text not null default 'pending' check (decision in ('pending', 'approved', 'rejected')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  legacy_id integer,
  created_at timestamptz not null default now()
);
create index if not exists growth_seo_drafts_company on public.growth_seo_drafts (company_id, created_at desc);
create unique index if not exists growth_seo_drafts_legacy on public.growth_seo_drafts (company_id, legacy_id) where legacy_id is not null;

-- Long-form reports from the old service (REA competitor analyses, GA4 summaries). History only.
create table if not exists public.growth_seo_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  run_id uuid references public.growth_seo_runs(id) on delete set null,
  kind text not null check (kind in ('rea', 'ga4')),
  target text,
  title text not null,
  body text not null,
  legacy_id integer,
  created_at timestamptz not null default now()
);
create unique index if not exists growth_seo_reports_legacy on public.growth_seo_reports (company_id, legacy_id) where legacy_id is not null;

-- ── RLS: members read their own company; writes via RPC or the service role ─
do $$
declare t text;
begin
  foreach t in array array['growth_seo_sites','growth_seo_runs','growth_seo_pages','growth_seo_findings','growth_seo_changes',
                           'growth_seo_tasks','growth_seo_drafts','growth_seo_reports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "growth members read own company" on public.%I', t);
    execute format('create policy "growth members read own company" on public.%I for select to authenticated using (company_id = public.get_user_company_id(auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ── RPCs ───────────────────────────────────────────────────────────────────
-- Owner/company_admin sets up (or changes) the autopilot for their own site.
create or replace function public.growth_seo_configure_site(
  _site_url text, _enabled boolean, _crawl_every_hours smallint default 6, _llm_calls_per_day smallint default 12,
  _product_facts text default null
) returns text language plpgsql security definer set search_path to '' as $$
declare _company uuid := public.get_user_company_id(auth.uid());
        _url text := lower(rtrim(trim(_site_url), '/'));
        _host text;
        _gsc text;
begin
  if not public.growth_can_approve(auth.uid()) then raise exception 'only owner or company_admin may configure the SEO autopilot' using errcode = '42501'; end if;
  if _url !~ '^https://[a-z0-9.-]+$' then raise exception 'site must be https://host with no path' using errcode = '22023'; end if;
  _host := substring(_url from '^https://(.*)$');
  select gsc_site_url into _gsc from public.growth_analytics_connections where company_id = _company and status = 'active';
  if _gsc is null then raise exception 'connect and verify Search Console first (an active analytics connection)' using errcode = '42501'; end if;
  -- sc-domain:example.com covers example.com and its subdomains; a URL-prefix property only its own host.
  if not (
       (_gsc like 'sc-domain:%' and (_host = substring(_gsc from 11) or _host like '%.' || substring(_gsc from 11)))
    or (_gsc !~ '^sc-domain:' and _host = substring(_gsc from '^https?://([^/]+)/'))
  ) then raise exception 'site % is not covered by the verified Search Console property %', _host, _gsc using errcode = '42501'; end if;
  if _crawl_every_hours is null or _crawl_every_hours not between 1 and 168 then raise exception 'crawl interval must be 1–168 hours' using errcode = '22023'; end if;
  if _llm_calls_per_day is null or _llm_calls_per_day not between 0 and 40 then raise exception 'model calls per day must be 0–40' using errcode = '22023'; end if;
  insert into public.growth_seo_sites (company_id, site_url, enabled, crawl_every_hours, llm_calls_per_day, product_facts, updated_by)
  values (_company, _url, coalesce(_enabled, true), _crawl_every_hours, _llm_calls_per_day, coalesce(left(_product_facts, 4000), ''), auth.uid())
  on conflict (company_id) do update set site_url = excluded.site_url, enabled = excluded.enabled,
    crawl_every_hours = excluded.crawl_every_hours, llm_calls_per_day = excluded.llm_calls_per_day,
    product_facts = coalesce(left(_product_facts, 4000), public.growth_seo_sites.product_facts),
    updated_by = auth.uid(), updated_at = now();
  insert into public.growth_audit_log (company_id, actor_type, actor_id, event, detail)
  values (_company, 'user', auth.uid()::text, 'seo_autopilot.configured',
          jsonb_build_object('site_url', _url, 'enabled', coalesce(_enabled, true), 'crawl_every_hours', _crawl_every_hours, 'llm_calls_per_day', _llm_calls_per_day));
  return case when coalesce(_enabled, true) then 'enabled' else 'paused' end;
end $$;

-- A human approves or rejects a draft. Approval does NOT publish anything.
create or replace function public.growth_seo_decide_draft(_id uuid, _approve boolean, _note text default null)
returns text language plpgsql security definer set search_path to '' as $$
declare d public.growth_seo_drafts;
begin
  select * into d from public.growth_seo_drafts where id = _id for update;
  if not found or d.company_id is distinct from public.get_user_company_id(auth.uid()) then raise exception 'draft not found' using errcode = 'P0002'; end if;
  if not public.growth_can_approve(auth.uid()) then raise exception 'only owner or company_admin may decide' using errcode = '42501'; end if;
  if d.decision <> 'pending' then raise exception 'draft is already %', d.decision using errcode = '22023'; end if;
  update public.growth_seo_drafts set decision = case when _approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = left(_note, 1000) where id = _id;
  insert into public.growth_audit_log (company_id, actor_type, actor_id, event, subject_id, detail)
  values (d.company_id, 'user', auth.uid()::text, case when _approve then 'seo_draft.approved' else 'seo_draft.rejected' end, _id::text,
          jsonb_build_object('kind', d.kind, 'slug', d.slug, 'title', d.title));
  return case when _approve then 'approved' else 'rejected' end;
end $$;

revoke all on function public.growth_seo_configure_site(text, boolean, smallint, smallint, text), public.growth_seo_decide_draft(uuid, boolean, text) from public, anon;
grant execute on function public.growth_seo_configure_site(text, boolean, smallint, smallint, text), public.growth_seo_decide_draft(uuid, boolean, text) to authenticated;
