-- Integration Intelligence layer: capability usage tracking, computed
-- opportunities, and a cached DNA snapshot. All additive, no changes to
-- existing tables. Reuses the existing `integrations` table as the
-- connection registry (integration_connections already exists under that
-- name) and `integration_execution_logs` as the raw event log.

-- ─── workspace_capabilities ────────────────────────────────────────────
-- Denormalized snapshot of which capabilities this company currently has
-- available, and through which connection. Recalculated by
-- recalculateIntegrationDNA() whenever connections change — kept as its
-- own table (rather than always deriving live from `integrations` +
-- taxonomy) so the DNA/opportunity engine can query it in one pass and so
-- "discovered_at"/"last_verified_at" have somewhere real to live.
create table public.workspace_capabilities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  capability_id text not null,
  provider text not null,
  connection_id uuid references public.integrations(id) on delete cascade,
  status text not null default 'available' check (status in ('available', 'expired', 'error')),
  discovered_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  unique (company_id, capability_id, provider)
);

create index workspace_capabilities_company_idx on public.workspace_capabilities (company_id);
create index workspace_capabilities_connection_idx on public.workspace_capabilities (connection_id);

alter table public.workspace_capabilities enable row level security;

create policy "Members can view company capabilities"
  on public.workspace_capabilities for select
  using (company_id = public.get_user_company_id(auth.uid()));

-- Writes happen via service-role edge functions only (recalculation is
-- server-triggered, never client-driven) — matches the pattern already
-- used for ai_execution_runs/ai_execution_steps.

-- ─── capability_usage ──────────────────────────────────────────────────
-- Real, measured usage per capability per module — the Value Engine's
-- data source. Never fabricated; only ever incremented by an edge
-- function immediately after a real execution outcome is known.
create table public.capability_usage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  capability_id text not null,
  module text not null,
  execution_count integer not null default 0,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  last_used_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (company_id, capability_id, module)
);

create index capability_usage_company_idx on public.capability_usage (company_id);

alter table public.capability_usage enable row level security;

create policy "Members can view company capability usage"
  on public.capability_usage for select
  using (company_id = public.get_user_company_id(auth.uid()));

-- ─── integration_opportunities ─────────────────────────────────────────
create table public.integration_opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  type text not null check (type in (
    'READY_NOW', 'ONE_CONNECTION_AWAY', 'UNUSED_CAPABILITY',
    'CROSS_MODULE', 'WORKFLOW_COMBINATION', 'REDUNDANCY', 'BROKEN_CHAIN'
  )),
  title text not null,
  description text not null,
  reason text not null,
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  status text not null default 'open' check (status in ('open', 'dismissed', 'activated')),
  required_capabilities text[] not null default '{}',
  missing_capabilities text[] not null default '{}',
  impacted_modules text[] not null default '{}',
  estimated_manual_steps_removed integer not null default 0,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  dismissed_by uuid references public.profiles(user_id),
  activated_at timestamptz,
  activated_by uuid references public.profiles(user_id)
);

create index integration_opportunities_company_idx on public.integration_opportunities (company_id, status);

alter table public.integration_opportunities enable row level security;

create policy "Members can view company opportunities"
  on public.integration_opportunities for select
  using (company_id = public.get_user_company_id(auth.uid()));

-- Dismissing/activating is a real user action from the UI, not
-- service-role-only — any company member can act on an opportunity
-- surfaced to their own workspace (matches who can see it).
create policy "Members can dismiss or activate company opportunities"
  on public.integration_opportunities for update
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()));

-- ─── integration_dna (cached snapshot) ──────────────────────────────────
-- One row per company. Recomputed synchronously on every connection
-- change (deterministic part only — see recalculateIntegrationDNA) so the
-- UI never has to run the full aggregation query on every page load.
create table public.integration_dna (
  company_id uuid primary key references public.companies(id) on delete cascade,
  score integer not null default 0 check (score >= 0 and score <= 100),
  connected_count integer not null default 0,
  capability_count integer not null default 0,
  used_capability_count integer not null default 0,
  unused_capability_count integer not null default 0,
  ready_opportunity_count integer not null default 0,
  broken_chain_count integer not null default 0,
  needs_attention_count integer not null default 0,
  computed_at timestamptz not null default now()
);

alter table public.integration_dna enable row level security;

create policy "Members can view company DNA"
  on public.integration_dna for select
  using (company_id = public.get_user_company_id(auth.uid()));
