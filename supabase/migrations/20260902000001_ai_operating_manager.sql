-- AI Operating Manager: durable approvals, tenant memory, signals and audit.
-- Existing workspace_events and autopilot_actions remain the event bus and
-- action queue so the platform has one source of truth rather than parallel
-- "AI" tables that drift away from the product.

alter table public.autopilot_actions
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists idempotency_key text,
  add column if not exists risk_level text not null default 'medium',
  add column if not exists confirmation_required boolean not null default true,
  add column if not exists required_permission text not null default 'member',
  add column if not exists connector text not null default 'internal',
  add column if not exists preview jsonb not null default '{}'::jsonb,
  add column if not exists verification jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists autopilot_actions_company_idempotency_unique
  on public.autopilot_actions(company_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists autopilot_actions_approval_queue_idx
  on public.autopilot_actions(company_id, status, created_at desc);

-- Action state may only be changed through the authenticated edge function.
-- This closes the old path where a browser could mark its own action executed.
drop policy if exists "Users can create autopilot actions in own company" on public.autopilot_actions;
drop policy if exists "Users can update own autopilot actions" on public.autopilot_actions;

create table if not exists public.ai_signals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fingerprint text not null,
  signal_type text not null,
  category text not null default 'priority',
  severity text not null check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  confidence numeric(4,3) not null default 1 check (confidence >= 0 and confidence <= 1),
  title text not null,
  reason text not null,
  recommended_action text,
  recommended_action_name text,
  entity_type text,
  entity_id text,
  href text,
  deadline timestamptz,
  estimated_impact jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'snoozed', 'resolved', 'dismissed')),
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique(company_id, fingerprint)
);

create index if not exists ai_signals_inbox_idx
  on public.ai_signals(company_id, status, severity, deadline, last_detected_at desc);

create table if not exists public.ai_company_memory (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  memory_type text not null check (memory_type in ('company_profile', 'operating_rule', 'user_preference', 'learned_pattern', 'important_entity', 'historical_decision', 'workflow_knowledge')),
  memory_key text not null,
  value jsonb not null,
  source text not null default 'user',
  confidence numeric(4,3) not null default 1 check (confidence >= 0 and confidence <= 1),
  state text not null default 'observation' check (state in ('observation', 'inferred_preference', 'confirmed_rule')),
  created_by uuid references auth.users(id) on delete set null,
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, memory_type, memory_key)
);

create table if not exists public.ai_operating_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  category text not null default 'custom',
  definition jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  enabled boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, name)
);

create table if not exists public.ai_action_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  action_id uuid not null references public.autopilot_actions(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  model_provider text,
  model_name text,
  agent_name text,
  context_refs jsonb not null default '[]'::jsonb,
  detail jsonb not null default '{}'::jsonb,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_action_audit_company_idx
  on public.ai_action_audit(company_id, created_at desc);
create index if not exists ai_company_memory_lookup_idx
  on public.ai_company_memory(company_id, memory_type, state);

alter table public.ai_signals enable row level security;
alter table public.ai_company_memory enable row level security;
alter table public.ai_operating_rules enable row level security;
alter table public.ai_action_audit enable row level security;

drop policy if exists "Members view company AI signals" on public.ai_signals;
create policy "Members view company AI signals" on public.ai_signals
  for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()));

drop policy if exists "Members view company AI memory" on public.ai_company_memory;
create policy "Members view company AI memory" on public.ai_company_memory
  for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()));

drop policy if exists "Members view company AI rules" on public.ai_operating_rules;
create policy "Members view company AI rules" on public.ai_operating_rules
  for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()));

drop policy if exists "Admins manage company AI rules" on public.ai_operating_rules;
create policy "Admins manage company AI rules" on public.ai_operating_rules
  for all to authenticated
  using (company_id = public.get_user_company_id(auth.uid()) and public.is_company_admin(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()) and public.is_company_admin(auth.uid()));

drop policy if exists "Members view company AI audit" on public.ai_action_audit;
create policy "Members view company AI audit" on public.ai_action_audit
  for select to authenticated
  using (company_id = public.get_user_company_id(auth.uid()));

-- Atomic claim prevents refresh, retry and double-click from executing the
-- same side effect twice. Only service-role Edge Functions may call it.
create or replace function public.claim_ai_action_execution(
  p_action_id uuid,
  p_company_id uuid,
  p_approved_by uuid,
  p_allow_retry boolean default false
)
returns public.autopilot_actions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.autopilot_actions;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select * into v_action
  from public.autopilot_actions
  where id = p_action_id and company_id = p_company_id
  for update;

  if not found then
    raise exception 'Action not found' using errcode = 'P0002';
  end if;

  if v_action.status in ('completed', 'executed') then
    return v_action;
  end if;
  if v_action.status = 'executing' then
    raise exception 'Action is already executing' using errcode = '55000';
  end if;
  if v_action.status = 'failed' and not p_allow_retry then
    raise exception 'Retry must be requested explicitly' using errcode = '55000';
  end if;
  if v_action.status not in ('proposed', 'awaiting_approval', 'approved', 'failed') then
    raise exception 'Action cannot be executed from status %', v_action.status using errcode = '55000';
  end if;

  update public.autopilot_actions
  set status = 'executing',
      approved_by = coalesce(approved_by, p_approved_by),
      approved_at = coalesce(approved_at, now()),
      attempt_count = attempt_count + 1,
      last_attempt_at = now(),
      failure_reason = null,
      updated_at = now()
  where id = p_action_id
  returning * into v_action;

  return v_action;
end;
$$;

revoke all on function public.claim_ai_action_execution(uuid, uuid, uuid, boolean) from public;
grant execute on function public.claim_ai_action_execution(uuid, uuid, uuid, boolean) to service_role;

-- Realtime keeps the right-hand Action Center current without polling.
do $$
begin
  alter publication supabase_realtime add table public.ai_signals;
exception when duplicate_object then null;
end $$;

