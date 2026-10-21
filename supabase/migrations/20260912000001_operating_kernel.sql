-- Shared operating kernel. This extends the existing workspace_events/workflows
-- architecture instead of introducing a second event bus or workflow product.

alter table public.workspace_events
  add column if not exists event_version integer not null default 1,
  add column if not exists source text,
  add column if not exists external_event_id text,
  add column if not exists idempotency_key text,
  add column if not exists correlation_id uuid,
  add column if not exists causation_id uuid references public.workspace_events(id) on delete set null,
  add column if not exists actor_type text not null default 'user',
  add column if not exists occurred_at timestamptz not null default now(),
  add column if not exists status text not null default 'pending',
  add column if not exists attempt_count integer not null default 0,
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists processed_at timestamptz,
  add column if not exists last_error text;

update public.workspace_events set source = source_module where source is null;
update public.workspace_events set correlation_id = id where correlation_id is null;

alter table public.workspace_events
  alter column source set not null,
  alter column correlation_id set not null,
  add constraint workspace_events_version_positive check (event_version > 0),
  add constraint workspace_events_status_valid check (status in ('pending', 'processing', 'processed', 'failed', 'dead_letter')),
  add constraint workspace_events_attempt_count_nonnegative check (attempt_count >= 0);

create unique index if not exists workspace_events_company_idempotency_unique
  on public.workspace_events(company_id, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists workspace_events_company_external_unique
  on public.workspace_events(company_id, source, external_event_id)
  where external_event_id is not null;
create index if not exists workspace_events_processing_queue_idx
  on public.workspace_events(status, available_at, created_at)
  where status in ('pending', 'failed');
create index if not exists workspace_events_correlation_idx
  on public.workspace_events(company_id, correlation_id, occurred_at);

comment on table public.workspace_events is
  'Canonical append-only business event ledger and durable outbox for a workspace.';

-- Force all event producers through the validated contract below.
drop policy if exists "Members emit events" on public.workspace_events;

create table if not exists public.external_identities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  integration_id uuid references public.integrations(id) on delete set null,
  provider text not null,
  external_account_id text not null default '',
  external_entity_type text not null,
  external_entity_id text not null,
  entity_type text not null,
  entity_id uuid not null,
  identity_data jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(company_id, provider, external_account_id, external_entity_type, external_entity_id)
);

create index if not exists external_identities_entity_idx
  on public.external_identities(company_id, entity_type, entity_id);

create table if not exists public.entity_relationships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  from_entity_type text not null,
  from_entity_id uuid not null,
  relationship_type text not null,
  to_entity_type text not null,
  to_entity_id uuid not null,
  source_event_id uuid references public.workspace_events(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(company_id, from_entity_type, from_entity_id, relationship_type, to_entity_type, to_entity_id),
  check (from_entity_type <> to_entity_type or from_entity_id <> to_entity_id)
);

create index if not exists entity_relationships_from_idx
  on public.entity_relationships(company_id, from_entity_type, from_entity_id);
create index if not exists entity_relationships_to_idx
  on public.entity_relationships(company_id, to_entity_type, to_entity_id);

-- Preserve acquisition provenance on the canonical lead/customer record.
alter table public.customers
  add column if not exists acquisition_source text,
  add column if not exists acquisition_detail text,
  add column if not exists integration_id uuid references public.integrations(id) on delete set null,
  add column if not exists source_event_id uuid references public.workspace_events(id) on delete set null,
  add column if not exists attribution jsonb not null default '{}'::jsonb;

create index if not exists customers_acquisition_idx
  on public.customers(company_id, acquisition_source, created_at desc);

alter table public.workflows
  add column if not exists version integer not null default 1,
  add column if not exists trigger_source text,
  add column if not exists conditions jsonb not null default '{}'::jsonb,
  add column if not exists steps jsonb not null default '[]'::jsonb,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists requires_approval boolean not null default false;

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  workflow_version integer not null,
  event_id uuid not null references public.workspace_events(id) on delete cascade,
  correlation_id uuid not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting', 'approval_required', 'completed', 'cancelled', 'failed', 'dead_letter')),
  current_step integer not null default 0,
  context jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workflow_id, event_id)
);

create index if not exists workflow_runs_queue_idx
  on public.workflow_runs(status, available_at, created_at)
  where status in ('queued', 'failed', 'waiting');
create index if not exists workflow_runs_company_history_idx
  on public.workflow_runs(company_id, created_at desc);
create index if not exists workflow_runs_correlation_idx
  on public.workflow_runs(company_id, correlation_id);

create table if not exists public.workflow_step_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  workflow_run_id uuid not null references public.workflow_runs(id) on delete cascade,
  step_index integer not null,
  step_type text not null,
  idempotency_key text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'waiting', 'approval_required', 'completed', 'cancelled', 'failed')),
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, idempotency_key),
  unique(workflow_run_id, step_index)
);

alter table public.external_identities enable row level security;
alter table public.entity_relationships enable row level security;
alter table public.workflow_runs enable row level security;
alter table public.workflow_step_runs enable row level security;

create policy "Members view external identities" on public.external_identities
  for select to authenticated using (company_id = public.get_user_company_id(auth.uid()));
create policy "Members view entity relationships" on public.entity_relationships
  for select to authenticated using (company_id = public.get_user_company_id(auth.uid()));
create policy "Members view workflow runs" on public.workflow_runs
  for select to authenticated using (company_id = public.get_user_company_id(auth.uid()));
create policy "Members view workflow step runs" on public.workflow_step_runs
  for select to authenticated using (company_id = public.get_user_company_id(auth.uid()));

-- Event writes go through this contract. Browser callers cannot emit events
-- for another tenant; service-role integration adapters may emit explicitly.
create or replace function public.emit_workspace_event(
  _company_id uuid,
  _type text,
  _source text,
  _entity_type text default null,
  _entity_id text default null,
  _payload jsonb default '{}'::jsonb,
  _actor uuid default null,
  _idempotency_key text default null,
  _external_event_id text default null,
  _correlation_id uuid default null,
  _causation_id uuid default null,
  _event_version integer default 1,
  _occurred_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_existing uuid;
begin
  if _company_id is null or nullif(trim(_type), '') is null or nullif(trim(_source), '') is null then
    raise exception 'company_id, type and source are required' using errcode = '22023';
  end if;
  if auth.role() <> 'service_role' and _company_id <> public.get_user_company_id(auth.uid()) then
    raise exception 'Cross-workspace event denied' using errcode = '42501';
  end if;

  -- Serialize provider/idempotency replays before checking. This makes a retry
  -- after an uncertain response return the original event instead of surfacing
  -- a unique-constraint error.
  if _idempotency_key is not null or _external_event_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      _company_id::text || ':' || _source || ':' || coalesce(_idempotency_key, _external_event_id), 0
    ));
  end if;

  if _idempotency_key is not null then
    select id into v_existing from public.workspace_events
      where company_id = _company_id and idempotency_key = _idempotency_key;
    if found then return v_existing; end if;
  end if;
  if _external_event_id is not null then
    select id into v_existing from public.workspace_events
      where company_id = _company_id and source = _source and external_event_id = _external_event_id;
    if found then return v_existing; end if;
  end if;

  insert into public.workspace_events(
    id, company_id, type, event_version, source_module, source,
    external_event_id, idempotency_key, entity_type, entity_id, payload,
    actor_user_id, actor_type, correlation_id, causation_id, occurred_at
  ) values (
    v_id, _company_id, lower(trim(_type)), _event_version, _source, _source,
    _external_event_id, _idempotency_key, _entity_type, _entity_id,
    coalesce(_payload, '{}'::jsonb), _actor,
    case when _actor is null then 'system' else 'user' end,
    coalesce(_correlation_id, v_id), _causation_id, coalesce(_occurred_at, now())
  )
  on conflict (company_id, idempotency_key) where idempotency_key is not null
  do update set idempotency_key = excluded.idempotency_key
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.emit_workspace_event(uuid,text,text,text,text,jsonb,uuid,text,text,uuid,uuid,integer,timestamptz) from public;
grant execute on function public.emit_workspace_event(uuid,text,text,text,text,jsonb,uuid,text,text,uuid,uuid,integer,timestamptz) to service_role;

-- Backward-compatible contract for existing triggers and Edge Functions.
create or replace function public.emit_workspace_event(
  _company_id uuid, _type text, _source text, _entity_type text,
  _entity_id text, _payload jsonb, _actor uuid
) returns uuid
language sql security definer set search_path = public as $$
  select public.emit_workspace_event(
    _company_id, _type, _source, _entity_type, _entity_id, _payload, _actor,
    null, null, null, null, 1, now()
  );
$$;

revoke all on function public.emit_workspace_event(uuid,text,text,text,text,jsonb,uuid) from public;
grant execute on function public.emit_workspace_event(uuid,text,text,text,text,jsonb,uuid) to service_role;

-- Integration adapters resolve deterministic provider IDs here. An existing
-- identity is never silently repointed to another internal entity.
create or replace function public.resolve_external_identity(
  p_company_id uuid,
  p_integration_id uuid,
  p_provider text,
  p_external_account_id text,
  p_external_entity_type text,
  p_external_entity_id text,
  p_entity_type text,
  p_entity_id uuid,
  p_identity_data jsonb default '{}'::jsonb
) returns public.external_identities
language plpgsql security definer set search_path = public as $$
declare v_identity public.external_identities;
begin
  if auth.role() <> 'service_role' and p_company_id <> public.get_user_company_id(auth.uid()) then
    raise exception 'Cross-workspace identity resolution denied' using errcode = '42501';
  end if;
  if p_integration_id is not null and not exists (
    select 1 from public.integrations where id = p_integration_id and company_id = p_company_id
  ) then
    raise exception 'Integration does not belong to workspace' using errcode = '23503';
  end if;

  select * into v_identity from public.external_identities
  where company_id = p_company_id and provider = lower(trim(p_provider))
    and external_account_id = coalesce(p_external_account_id, '')
    and external_entity_type = lower(trim(p_external_entity_type))
    and external_entity_id = p_external_entity_id
  for update;

  if found then
    if v_identity.entity_type <> p_entity_type or v_identity.entity_id <> p_entity_id then
      raise exception 'External identity is already mapped to another entity' using errcode = '23505';
    end if;
    update public.external_identities set
      last_seen_at = now(), identity_data = identity_data || coalesce(p_identity_data, '{}'::jsonb),
      integration_id = coalesce(p_integration_id, integration_id)
    where id = v_identity.id returning * into v_identity;
    return v_identity;
  end if;

  insert into public.external_identities(
    company_id, integration_id, provider, external_account_id,
    external_entity_type, external_entity_id, entity_type, entity_id, identity_data
  ) values (
    p_company_id, p_integration_id, lower(trim(p_provider)), coalesce(p_external_account_id, ''),
    lower(trim(p_external_entity_type)), p_external_entity_id, p_entity_type, p_entity_id,
    coalesce(p_identity_data, '{}'::jsonb)
  ) returning * into v_identity;
  return v_identity;
end;
$$;

revoke all on function public.resolve_external_identity(uuid,uuid,text,text,text,text,text,uuid,jsonb) from public;
grant execute on function public.resolve_external_identity(uuid,uuid,text,text,text,text,text,uuid,jsonb) to service_role;

create or replace function public.link_business_entities(
  p_company_id uuid,
  p_from_type text,
  p_from_id uuid,
  p_relationship text,
  p_to_type text,
  p_to_id uuid,
  p_source_event_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.role() <> 'service_role' and p_company_id <> public.get_user_company_id(auth.uid()) then
    raise exception 'Cross-workspace relationship denied' using errcode = '42501';
  end if;
  if p_source_event_id is not null and not exists (
    select 1 from public.workspace_events where id = p_source_event_id and company_id = p_company_id
  ) then
    raise exception 'Source event does not belong to workspace' using errcode = '23503';
  end if;
  insert into public.entity_relationships(
    company_id, from_entity_type, from_entity_id, relationship_type,
    to_entity_type, to_entity_id, source_event_id, metadata
  ) values (
    p_company_id, p_from_type, p_from_id, p_relationship,
    p_to_type, p_to_id, p_source_event_id, coalesce(p_metadata, '{}'::jsonb)
  ) on conflict (company_id, from_entity_type, from_entity_id, relationship_type, to_entity_type, to_entity_id)
    do update set metadata = public.entity_relationships.metadata || excluded.metadata,
      source_event_id = coalesce(excluded.source_event_id, public.entity_relationships.source_event_id)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.link_business_entities(uuid,text,uuid,text,text,uuid,uuid,jsonb) from public;
grant execute on function public.link_business_entities(uuid,text,uuid,text,text,uuid,uuid,jsonb) to service_role;

-- Matching is intentionally deterministic: exact event type/source and JSON
-- containment. More advanced branching belongs in versioned workflow steps.
create or replace function public.enqueue_matching_workflows()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workflow_runs(
    company_id, workflow_id, workflow_version, event_id, correlation_id, context
  )
  select new.company_id, w.id, w.version, new.id, new.correlation_id,
    jsonb_build_object('event', new.payload, 'entity_type', new.entity_type, 'entity_id', new.entity_id)
  from public.workflows w
  where w.company_id = new.company_id
    and w.is_active
    and w.trigger_event = new.type
    and (w.trigger_source is null or w.trigger_source = new.source)
    and (w.conditions = '{}'::jsonb or new.payload @> w.conditions)
  on conflict (workflow_id, event_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_matching_workflows on public.workspace_events;
create trigger trg_enqueue_matching_workflows
after insert on public.workspace_events
for each row execute function public.enqueue_matching_workflows();

-- Generic domain publisher for the existing canonical tables. It only emits
-- lifecycle-relevant changes, preventing update noise and event recursion.
create or replace function public.publish_domain_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_company uuid := (v_row->>'company_id')::uuid;
  v_entity_id text := v_row->>'id';
  v_type text;
  v_payload jsonb;
  v_idempotency_key text;
begin
  if tg_op = 'INSERT' then
    v_type := case
      when tg_argv[0] = 'meeting' then 'meeting.booked'
      when tg_argv[0] = 'email' then 'email.received'
      when tg_argv[0] = 'payment' and lower(coalesce(v_row->>'status', '')) in ('paid','completed','succeeded') then 'payment.received'
      else tg_argv[0] || '.created'
    end;
  elsif nullif(tg_argv[1], '') is not null and v_old->>tg_argv[1] is distinct from v_row->>tg_argv[1] then
    v_type := case
      when tg_argv[0] = 'deal' and lower(v_row->>'stage') in ('won','lost') then 'deal.' || lower(v_row->>'stage')
      when tg_argv[0] = 'task' and lower(v_row->>'status') = 'completed' then 'task.completed'
      when tg_argv[0] = 'payment' and lower(v_row->>'status') in ('paid','completed','succeeded') then 'payment.received'
      else tg_argv[0] || '.' || tg_argv[2]
    end;
  else
    return new;
  end if;
  v_payload := jsonb_build_object(
    'current', v_row - array['access_token','refresh_token','auth_token','api_key'],
    'previous', v_old - array['access_token','refresh_token','auth_token','api_key']
  );
  v_idempotency_key := 'domain:' || v_type || ':' || v_entity_id;
  perform public.emit_workspace_event(
    v_company, v_type, tg_argv[3], tg_argv[0], v_entity_id, v_payload,
    auth.uid(), v_idempotency_key, null, null, null, 1, now()
  );
  return new;
end;
$$;

create or replace function public.publish_customer_lifecycle_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_type text;
  v_payload jsonb;
begin
  if tg_op = 'INSERT' then
    v_type := new.record_type || '.created';
  elsif old.record_type = 'lead' and new.record_type = 'customer' then
    v_type := 'lead.converted';
  elsif new.record_type = 'lead' and old.owner_id is distinct from new.owner_id then
    v_type := 'lead.assigned';
  elsif new.record_type = 'lead' and old.status is distinct from new.status then
    v_type := case when new.status::text = 'qualified' then 'lead.qualified' else 'lead.updated' end;
  else
    return new;
  end if;

  v_payload := jsonb_build_object(
    'current', to_jsonb(new),
    'previous', case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end,
    'attribution', coalesce(new.attribution, '{}'::jsonb)
  );
  perform public.emit_workspace_event(
    new.company_id, v_type, coalesce(new.acquisition_source, 'crm'),
    new.record_type, new.id::text, v_payload, auth.uid(), null, null,
    null, new.source_event_id, 1, now()
  );
  return new;
end;
$$;

drop trigger if exists trg_event_customers on public.customers;
create trigger trg_event_customers
after insert or update of status, owner_id, record_type on public.customers
for each row execute function public.publish_customer_lifecycle_change();

drop trigger if exists trg_event_calendar on public.calendar_events;
create trigger trg_event_calendar after insert on public.calendar_events
for each row execute function public.publish_domain_change('meeting','','','calendar');

drop trigger if exists trg_event_emails on public.emails;
create trigger trg_event_emails after insert on public.emails
for each row execute function public.publish_domain_change('email','','','email');

drop trigger if exists trg_event_payments on public.payments;
create trigger trg_event_payments after insert or update of status on public.payments
for each row execute function public.publish_domain_change('payment','status','status_changed','finance');

create or replace function public.claim_workflow_runs(p_worker text, p_limit integer default 10)
returns setof public.workflow_runs
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return query
  with candidates as (
    select id from public.workflow_runs
    where status in ('queued','failed','waiting') and available_at <= now()
      and attempt_count < 5
    order by created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 100))
  )
  update public.workflow_runs r set
    status = 'running', locked_at = now(), locked_by = p_worker,
    started_at = coalesce(r.started_at, now()), attempt_count = r.attempt_count + 1,
    updated_at = now()
  from candidates c where r.id = c.id
  returning r.*;
end;
$$;

revoke all on function public.claim_workflow_runs(text,integer) from public, anon, authenticated;
grant execute on function public.claim_workflow_runs(text,integer) to service_role;
