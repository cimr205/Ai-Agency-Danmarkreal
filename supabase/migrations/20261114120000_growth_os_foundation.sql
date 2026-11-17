-- Growth OS, Phase 1 foundation: task queue, activity, model usage, budgets,
-- reports, learning records, approvals and an append-only audit log.
--
-- Tenant isolation: every row carries company_id; members read their own
-- company's rows through RLS (get_user_company_id). Writes go through the
-- SECURITY DEFINER functions below or the agent runtime (service role), never
-- through direct client inserts. Agent and skill *definitions* live in code
-- (supabase/functions/_shared/growth-os/registry) and hold no customer data.

-- ── helpers ────────────────────────────────────────────────────────────────
create or replace function public.growth_can_approve(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role in ('owner', 'company_admin')
      and company_id = public.get_user_company_id(_user_id)
  )
$$;

create or replace function public.growth_can_operate(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role in ('owner', 'company_admin', 'manager')
      and company_id = public.get_user_company_id(_user_id)
  )
$$;

-- Mirrors ACTION_LEVELS in _shared/growth-os/approval.ts (a test keeps them in sync). Unknown → 3.
create or replace function public.growth_action_level(_action text)
returns smallint language sql immutable as $$
  select case
    when _action in ('read.public_url','read.tenant_data','analyze','report.create') then 0
    when _action in ('draft.create','proposal.create','learning.record','skill.candidate.create','eval.run_isolated') then 1
    when _action in ('experiment.start_controlled','config.internal_update','skill.activate','model_routing.change') then 2
    else 3
  end::smallint
$$;

-- Agents with an executor on this branch. Enqueueing anything else is refused.
create or replace function public.growth_executable(_agent_id text, _type text)
returns boolean language sql immutable as $$
  select (_agent_id, _type) in (('seo-agent', 'seo.onpage_audit'))
$$;

-- ── budgets ────────────────────────────────────────────────────────────────
create table if not exists public.growth_budgets (
  company_id uuid primary key references public.companies(id) on delete cascade,
  daily_usd_limit numeric(12,6) not null default 0.50 check (daily_usd_limit >= 0),
  task_usd_limit numeric(12,6) not null default 0.05 check (task_usd_limit >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.growth_budget_days (
  company_id uuid not null references public.companies(id) on delete cascade,
  day date not null,
  spent_usd numeric(14,8) not null default 0 check (spent_usd >= 0),
  primary key (company_id, day)
);

-- ── task queue ─────────────────────────────────────────────────────────────
create table if not exists public.growth_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_id text not null,
  type text not null,
  input jsonb not null default '{}'::jsonb,
  objective text,
  status text not null default 'queued'
    check (status in ('queued','leased','completed','failed','inconclusive','blocked','cancelled','dead')),
  priority smallint not null default 5 check (priority between 0 and 9),
  idempotency_key text not null,
  budget_usd numeric(12,6) not null check (budget_usd >= 0),
  deadline_at timestamptz,
  timeout_seconds integer not null default 120 check (timeout_seconds between 10 and 900),
  attempts integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  lease_owner text,
  lease_expires_at timestamptz,
  checkpoint jsonb,
  result jsonb,
  last_error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, idempotency_key)
);
create index if not exists growth_tasks_claim_idx on public.growth_tasks (status, priority desc, created_at) where status in ('queued','leased');
create index if not exists growth_tasks_company_idx on public.growth_tasks (company_id, created_at desc);

-- ── activity, usage, reports, learning ─────────────────────────────────────
create table if not exists public.growth_activity_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid references public.growth_tasks(id) on delete cascade,
  agent_id text not null,
  phase text not null check (phase in ('observe','plan','execute','verify','evaluate','learn','report','ceo','queue','approval')),
  action text not null,
  status text not null check (status in ('ok','failed','skipped','blocked')),
  detail jsonb not null default '{}'::jsonb,
  cost_usd numeric(14,8),
  created_at timestamptz not null default now()
);
create index if not exists growth_activity_company_idx on public.growth_activity_events (company_id, created_at desc);

create table if not exists public.growth_model_usage (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid references public.growth_tasks(id) on delete set null,
  agent_id text not null,
  request_id text not null,
  generation_id text,
  model text not null,
  purpose text not null,
  prompt_version text,
  prompt_tokens integer,
  completion_tokens integer,
  estimated_usd numeric(14,8) not null,
  actual_usd numeric(14,8),
  latency_ms integer not null,
  attempt smallint not null,
  status text not null check (status in ('ok','error','invalid_output','refused_budget','cache_hit')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists growth_usage_company_idx on public.growth_model_usage (company_id, created_at desc);

create table if not exists public.growth_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null references public.growth_tasks(id) on delete cascade,
  agent_id text not null,
  kind text not null check (kind in ('agent','verification','ceo')),
  body jsonb not null,
  created_at timestamptz not null default now(),
  unique (task_id, kind)
);

create table if not exists public.growth_learning_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid references public.growth_tasks(id) on delete set null,
  agent_id text not null,
  skill_version text not null,
  model text,
  prompt_version text not null,
  outcome text not null check (outcome in ('new_learning','method_confirmed','problem_documented','improvement_proposed')),
  observation text not null,
  evidence jsonb,
  probable_cause text,
  proposed_change text,
  expected_benefit text,
  risk text,
  -- A learning record is not an approved change. Only Phase 2 evaluation moves it on.
  evaluation_status text not null default 'not_evaluated' check (evaluation_status in ('not_evaluated','evaluating','passed','failed','inconclusive')),
  created_at timestamptz not null default now()
);

-- ── approvals (version-locked by payload hash) ─────────────────────────────
create table if not exists public.growth_approval_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid references public.growth_tasks(id) on delete set null,
  agent_id text not null,
  action text not null,
  level smallint not null check (level between 0 and 3),
  payload jsonb not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  summary text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired','consumed')),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  consumed_at timestamptz
);
create index if not exists growth_approvals_company_idx on public.growth_approval_requests (company_id, status, requested_at desc);

-- ── audit log (append-only) ────────────────────────────────────────────────
create table if not exists public.growth_audit_log (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_type text not null check (actor_type in ('user','agent','system')),
  actor_id text not null,
  event text not null,
  subject_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function public.growth_audit_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'growth_audit_log is append-only';
end $$;
drop trigger if exists growth_audit_no_update on public.growth_audit_log;
create trigger growth_audit_no_update before update or delete on public.growth_audit_log
  for each row execute function public.growth_audit_immutable();

-- ── RLS: members read their own company; no direct client writes ───────────
do $$
declare t text;
begin
  foreach t in array array['growth_budgets','growth_budget_days','growth_tasks','growth_activity_events','growth_model_usage',
                           'growth_reports','growth_learning_records','growth_approval_requests','growth_audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "growth members read own company" on public.%I', t);
    execute format('create policy "growth members read own company" on public.%I for select to authenticated using (company_id = public.get_user_company_id(auth.uid()))', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ── RPCs for signed-in users ───────────────────────────────────────────────
create or replace function public.growth_enqueue_task(
  _agent_id text, _type text, _input jsonb, _objective text, _idempotency_key text,
  _priority smallint default 5, _budget_usd numeric default null
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  _company uuid := public.get_user_company_id(auth.uid());
  _limit numeric;
  _id uuid;
begin
  if auth.uid() is null or _company is null then raise exception 'not signed in to a company' using errcode = '42501'; end if;
  if not public.growth_can_operate(auth.uid()) then raise exception 'only owner, company_admin or manager may start Growth OS tasks' using errcode = '42501'; end if;
  if not public.growth_executable(_agent_id, _type) then raise exception 'agent % has no executor for %', _agent_id, _type using errcode = '22023'; end if;
  if _idempotency_key is null or length(_idempotency_key) not between 8 and 200 then raise exception 'idempotency key required' using errcode = '22023'; end if;
  select task_usd_limit into _limit from public.growth_budgets where company_id = _company;
  _limit := coalesce(_limit, 0.05);
  if _budget_usd is not null and _budget_usd > _limit then raise exception 'task budget % exceeds the company limit %', _budget_usd, _limit using errcode = '22023'; end if;

  insert into public.growth_tasks (company_id, agent_id, type, input, objective, priority, idempotency_key, budget_usd, created_by)
  values (_company, _agent_id, _type, coalesce(_input, '{}'::jsonb), left(_objective, 500), coalesce(_priority, 5), _idempotency_key, coalesce(_budget_usd, _limit), auth.uid())
  on conflict (company_id, idempotency_key) do nothing
  returning id into _id;
  if _id is null then
    -- Same key again: return the existing task instead of running it twice.
    select id into _id from public.growth_tasks where company_id = _company and idempotency_key = _idempotency_key;
    return _id;
  end if;
  insert into public.growth_activity_events (company_id, task_id, agent_id, phase, action, status, detail)
  values (_company, _id, _agent_id, 'queue', 'task.enqueue', 'ok', jsonb_build_object('type', _type, 'by', auth.uid()));
  insert into public.growth_audit_log (company_id, actor_type, actor_id, event, subject_id, detail)
  values (_company, 'user', auth.uid()::text, 'task.enqueued', _id::text, jsonb_build_object('agent', _agent_id, 'type', _type));
  return _id;
end $$;

create or replace function public.growth_decide_approval(_request_id uuid, _approve boolean, _reason text default null)
returns text language plpgsql security definer set search_path to 'public' as $$
declare r public.growth_approval_requests;
begin
  if auth.uid() is null then raise exception 'humans only' using errcode = '42501'; end if;
  select * into r from public.growth_approval_requests where id = _request_id for update;
  if not found or r.company_id is distinct from public.get_user_company_id(auth.uid()) then
    raise exception 'approval request not found' using errcode = 'P0002';
  end if;
  if not public.growth_can_approve(auth.uid()) then raise exception 'only owner or company_admin may decide' using errcode = '42501'; end if;
  if r.status <> 'pending' then raise exception 'request is %', r.status using errcode = '22023'; end if;
  if r.expires_at < now() then
    update public.growth_approval_requests set status = 'expired' where id = r.id;
    return 'expired';
  end if;
  update public.growth_approval_requests
     set status = case when _approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_reason = left(_reason, 1000)
   where id = r.id;
  insert into public.growth_audit_log (company_id, actor_type, actor_id, event, subject_id, detail)
  values (r.company_id, 'user', auth.uid()::text, case when _approve then 'approval.approved' else 'approval.rejected' end, r.id::text,
          jsonb_build_object('action', r.action, 'level', r.level, 'payload_hash', r.payload_hash, 'reason', left(_reason, 1000)));
  return case when _approve then 'approved' else 'rejected' end;
end $$;

-- ── RPCs for the agent runtime (service role only) ─────────────────────────
-- Claims the next task with a lease. SKIP LOCKED: two workers never get the
-- same task; an expired lease is reclaimable; attempts past max go 'dead'.
create or replace function public.growth_claim_task(_worker text, _lease_seconds integer default 180, _company_id uuid default null)
returns setof public.growth_tasks language plpgsql security definer set search_path to 'public' as $$
begin
  update public.growth_tasks set status = 'dead', last_error = coalesce(last_error, 'max attempts reached'), lease_owner = null, lease_expires_at = null, updated_at = now()
   where status = 'leased' and lease_expires_at < now() and attempts >= max_attempts;
  return query
  with next as (
    select id from public.growth_tasks
     where (status = 'queued' or (status = 'leased' and lease_expires_at < now()))
       and attempts < max_attempts
       and (_company_id is null or company_id = _company_id)
       and (deadline_at is null or deadline_at > now())
     order by priority desc, created_at
     limit 1
     for update skip locked
  )
  update public.growth_tasks t
     set status = 'leased', lease_owner = _worker, lease_expires_at = now() + make_interval(secs => _lease_seconds),
         attempts = t.attempts + 1, updated_at = now()
    from next where t.id = next.id
  returning t.*;
end $$;

create or replace function public.growth_finish_task(_task_id uuid, _worker text, _status text, _result jsonb, _error text default null)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if _status not in ('completed','failed','inconclusive','blocked') then raise exception 'bad status %', _status; end if;
  update public.growth_tasks
     set status = _status, result = _result, last_error = left(_error, 2000), lease_owner = null, lease_expires_at = null, updated_at = now()
   where id = _task_id and status = 'leased' and lease_owner = _worker;
  return found; -- false: the lease was lost, the result is not written twice
end $$;

create or replace function public.growth_checkpoint(_task_id uuid, _worker text, _checkpoint jsonb)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  update public.growth_tasks set checkpoint = _checkpoint, updated_at = now()
   where id = _task_id and status = 'leased' and lease_owner = _worker and lease_expires_at > now();
  return found;
end $$;

-- Atomic budget reservation: refuses when today's spend + amount would pass the daily limit.
create or replace function public.growth_reserve_budget(_company_id uuid, _usd numeric)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare _limit numeric; _ok boolean;
begin
  if _usd < 0 then raise exception 'negative amount'; end if;
  select daily_usd_limit into _limit from public.growth_budgets where company_id = _company_id;
  _limit := coalesce(_limit, 0.50);
  insert into public.growth_budget_days (company_id, day, spent_usd) values (_company_id, current_date, 0)
  on conflict (company_id, day) do nothing;
  update public.growth_budget_days set spent_usd = spent_usd + _usd
   where company_id = _company_id and day = current_date and spent_usd + _usd <= _limit
  returning true into _ok;
  return coalesce(_ok, false);
end $$;

-- Replaces a reservation with the actual cost (null actual = keep the reservation).
create or replace function public.growth_settle_budget(_company_id uuid, _reserved numeric, _actual numeric)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.growth_budget_days
     set spent_usd = greatest(0, spent_usd - _reserved + coalesce(_actual, _reserved))
   where company_id = _company_id and day = current_date;
end $$;

-- Executes only an approved, unexpired, unconsumed request with the exact payload hash; marks it consumed.
create or replace function public.growth_consume_approval(_company_id uuid, _action text, _payload_hash text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare _id uuid;
begin
  update public.growth_approval_requests
     set status = 'consumed', consumed_at = now()
   where id = (
     select id from public.growth_approval_requests
      where company_id = _company_id and action = _action and payload_hash = _payload_hash
        and status = 'approved' and expires_at > now()
      order by decided_at desc limit 1 for update)
  returning id into _id;
  return _id; -- null: no valid approval, the action must not run
end $$;

revoke all on function public.growth_claim_task(text, integer, uuid) from public, anon, authenticated;
revoke all on function public.growth_finish_task(uuid, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.growth_checkpoint(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.growth_reserve_budget(uuid, numeric) from public, anon, authenticated;
revoke all on function public.growth_settle_budget(uuid, numeric, numeric) from public, anon, authenticated;
revoke all on function public.growth_consume_approval(uuid, text, text) from public, anon, authenticated;
revoke all on function public.growth_enqueue_task(text, text, jsonb, text, text, smallint, numeric) from public, anon;
revoke all on function public.growth_decide_approval(uuid, boolean, text) from public, anon;
grant execute on function public.growth_enqueue_task(text, text, jsonb, text, text, smallint, numeric) to authenticated;
grant execute on function public.growth_decide_approval(uuid, boolean, text) to authenticated;
grant execute on function public.growth_claim_task(text, integer, uuid), public.growth_finish_task(uuid, text, text, jsonb, text),
  public.growth_checkpoint(uuid, text, jsonb), public.growth_reserve_budget(uuid, numeric),
  public.growth_settle_budget(uuid, numeric, numeric), public.growth_consume_approval(uuid, text, text) to service_role;

-- Budget settings: only owner/company_admin, never above the platform cap (1 USD/day in Phase 1).
create or replace function public.growth_set_budget(_daily_usd numeric, _task_usd numeric)
returns void language plpgsql security definer set search_path to 'public' as $$
declare _company uuid := public.get_user_company_id(auth.uid());
begin
  if not public.growth_can_approve(auth.uid()) then raise exception 'only owner or company_admin' using errcode = '42501'; end if;
  if _daily_usd < 0 or _daily_usd > 1 or _task_usd < 0 or _task_usd > _daily_usd then raise exception 'budget out of range (0–1 USD/day, task ≤ day)' using errcode = '22023'; end if;
  insert into public.growth_budgets (company_id, daily_usd_limit, task_usd_limit, updated_by) values (_company, _daily_usd, _task_usd, auth.uid())
  on conflict (company_id) do update set daily_usd_limit = excluded.daily_usd_limit, task_usd_limit = excluded.task_usd_limit, updated_at = now(), updated_by = excluded.updated_by;
  insert into public.growth_audit_log (company_id, actor_type, actor_id, event, detail)
  values (_company, 'user', auth.uid()::text, 'budget.set', jsonb_build_object('daily_usd', _daily_usd, 'task_usd', _task_usd));
end $$;
revoke all on function public.growth_set_budget(numeric, numeric) from public, anon;
grant execute on function public.growth_set_budget(numeric, numeric) to authenticated;
