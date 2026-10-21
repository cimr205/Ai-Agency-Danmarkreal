-- Phase 3: durable external execution and trusted provider ingress.

alter table public.workflow_step_runs
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists max_attempts integer not null default 5;
alter table public.workflow_step_runs drop constraint if exists workflow_step_runs_status_check;
alter table public.workflow_step_runs add constraint workflow_step_runs_status_check
  check (status in ('pending','running','waiting','approval_required','completed','cancelled','failed','dead_letter','needs_attention'));
create index if not exists workflow_step_runs_claim_idx
  on public.workflow_step_runs(status,available_at,created_at)
  where status in ('pending','failed','running');

create table if not exists public.workflow_side_effects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  step_run_id uuid not null references public.workflow_step_runs(id) on delete cascade,
  idempotency_key text not null,
  provider text not null,
  status text not null default 'reserved' check(status in ('reserved','succeeded','uncertain','failed')),
  provider_reference text,
  response jsonb,
  reserved_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(company_id,idempotency_key), unique(step_run_id)
);
alter table public.workflow_side_effects enable row level security;
create policy "Members view workflow side effects" on public.workflow_side_effects for select to authenticated
  using(company_id=public.get_user_company_id(auth.uid()));

create or replace function public.claim_workflow_steps(p_worker text,p_limit integer default 10,p_lease_seconds integer default 120)
returns setof public.workflow_step_runs language plpgsql security definer set search_path=public as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_worker,'')),'') is null then raise exception 'Worker id required' using errcode='22023'; end if;
  return query with candidates as (
    select s.id from public.workflow_step_runs s
    join public.workflow_runs r on r.id=s.workflow_run_id and r.company_id=s.company_id
    where ((s.status in ('pending','failed') and s.available_at<=now())
      or (s.status='running' and s.lease_expires_at<now()))
      and s.attempt_count<s.max_attempts
      and r.status not in ('cancelled','completed','dead_letter')
    order by s.available_at,s.created_at for update of s skip locked
    limit greatest(1,least(coalesce(p_limit,10),100))
  ) update public.workflow_step_runs s set status='running',locked_by=p_worker,locked_at=now(),
      lease_expires_at=now()+make_interval(secs=>greatest(30,least(coalesce(p_lease_seconds,120),900))),
      started_at=coalesce(s.started_at,now()),attempt_count=s.attempt_count+1,updated_at=now()
    from candidates c where s.id=c.id returning s.*;
end; $$;
revoke all on function public.claim_workflow_steps(text,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_workflow_steps(text,integer,integer) to service_role;

create or replace function public.reserve_workflow_side_effect(p_step_id uuid,p_worker text,p_provider text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.workflow_step_runs%rowtype; e public.workflow_side_effects%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into s from public.workflow_step_runs where id=p_step_id and status='running' and locked_by=p_worker and lease_expires_at>now() for update;
  if not found then raise exception 'Step lease is not owned by worker' using errcode='55000'; end if;
  select * into e from public.workflow_side_effects where step_run_id=s.id for update;
  if found then return jsonb_build_object('side_effect_id',e.id,'status',e.status,'provider_reference',e.provider_reference,'is_new',false,'can_execute',e.status='failed'); end if;
  insert into public.workflow_side_effects(company_id,step_run_id,idempotency_key,provider)
    values(s.company_id,s.id,s.idempotency_key,lower(trim(p_provider))) returning * into e;
  return jsonb_build_object('side_effect_id',e.id,'status',e.status,'is_new',true,'can_execute',true);
end; $$;
revoke all on function public.reserve_workflow_side_effect(uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_workflow_side_effect(uuid,text,text) to service_role;

create or replace function public.finish_workflow_step(p_step_id uuid,p_worker text,p_success boolean,p_output jsonb default null,p_error text default null,p_provider_reference text default null,p_retryable boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare s public.workflow_step_runs%rowtype; v_status text; v_delay integer;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into s from public.workflow_step_runs where id=p_step_id and status='running' and locked_by=p_worker for update;
  if not found then raise exception 'Step lease is not owned by worker' using errcode='55000'; end if;
  if p_success then
    update public.workflow_side_effects set status='succeeded',provider_reference=p_provider_reference,response=p_output,completed_at=now() where step_run_id=s.id;
    update public.workflow_step_runs set status='completed',output=p_output,last_error=null,completed_at=now(),locked_by=null,locked_at=null,lease_expires_at=null,updated_at=now() where id=s.id;
  else
    v_status:=case when not p_retryable or s.attempt_count>=s.max_attempts then 'dead_letter' else 'failed' end;
    v_delay:=least(3600,30*power(2,greatest(s.attempt_count-1,0))::integer);
    update public.workflow_side_effects set status=case when p_retryable then 'failed' else 'uncertain' end,response=jsonb_build_object('error',p_error),completed_at=now() where step_run_id=s.id;
    update public.workflow_step_runs set status=v_status,last_error=left(coalesce(p_error,'Unknown failure'),4000),
      available_at=case when v_status='failed' then now()+make_interval(secs=>v_delay) else available_at end,
      completed_at=case when v_status='dead_letter' then now() else null end,locked_by=null,locked_at=null,lease_expires_at=null,updated_at=now() where id=s.id;
  end if;
  update public.workflow_runs r set status=case
      when exists(select 1 from public.workflow_step_runs x where x.workflow_run_id=r.id and x.status in ('dead_letter','needs_attention')) then 'dead_letter'
      when exists(select 1 from public.workflow_step_runs x where x.workflow_run_id=r.id and x.status in ('pending','running','failed','waiting','approval_required')) then 'queued'
      else 'completed' end,
    completed_at=case when not exists(select 1 from public.workflow_step_runs x where x.workflow_run_id=r.id and x.status in ('pending','running','failed','waiting','approval_required')) then now() else null end,
    updated_at=now() where r.id=s.workflow_run_id;
end; $$;
revoke all on function public.finish_workflow_step(uuid,text,boolean,jsonb,text,text,boolean) from public,anon,authenticated;
grant execute on function public.finish_workflow_step(uuid,text,boolean,jsonb,text,text,boolean) to service_role;

create or replace function public.mark_workflow_step_attention(p_step_id uuid,p_worker text,p_error text)
returns void language plpgsql security definer set search_path=public as $$
declare v_run uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update public.workflow_step_runs set status='needs_attention',last_error=left(p_error,4000),completed_at=now(),
    locked_by=null,locked_at=null,lease_expires_at=null,updated_at=now()
    where id=p_step_id and status='running' and locked_by=p_worker returning workflow_run_id into v_run;
  if v_run is null then raise exception 'Step lease is not owned by worker' using errcode='55000'; end if;
  update public.workflow_side_effects set status='uncertain',response=jsonb_build_object('error',p_error),completed_at=now() where step_run_id=p_step_id;
  update public.workflow_runs set status='dead_letter',last_error=left(p_error,4000),updated_at=now() where id=v_run;
end; $$;
revoke all on function public.mark_workflow_step_attention(uuid,text,text) from public,anon,authenticated;
grant execute on function public.mark_workflow_step_attention(uuid,text,text) to service_role;

create table if not exists public.meta_webhook_sources (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  meta_connection_id uuid not null references public.meta_connections(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  page_id text not null, created_at timestamptz not null default now(), unique(page_id)
);
alter table public.meta_webhook_sources enable row level security;
create policy "Members view Meta webhook sources" on public.meta_webhook_sources for select to authenticated
  using(company_id=public.get_user_company_id(auth.uid()));

create table if not exists public.provider_webhook_receipts (
  id uuid primary key default gen_random_uuid(), provider text not null, external_event_id text not null,
  company_id uuid references public.companies(id) on delete cascade, status text not null default 'received',
  payload jsonb not null default '{}'::jsonb, error text, received_at timestamptz not null default now(), processed_at timestamptz,
  unique(provider,external_event_id)
);
alter table public.provider_webhook_receipts enable row level security;
create policy "Members view provider webhook receipts" on public.provider_webhook_receipts for select to authenticated
  using(company_id=public.get_user_company_id(auth.uid()));

-- Invoice webhooks must carry this opaque reference in provider metadata.
alter table public.invoices add column if not exists payment_reference uuid not null default gen_random_uuid();
create unique index if not exists invoices_payment_reference_unique on public.invoices(payment_reference);

create or replace function public.register_invoice_payment_service(
  p_company_id uuid,p_invoice_id uuid,p_amount numeric,p_payment_method text,p_paid_at timestamptz,
  p_idempotency_key text,p_external_reference text,p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_actor uuid; v_result jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if not exists(select 1 from public.invoices where id=p_invoice_id and company_id=p_company_id) then
    raise exception 'Invoice does not belong to workspace' using errcode='42501';
  end if;
  select user_id into v_actor from public.profiles where company_id=p_company_id order by created_at limit 1;
  if v_actor is null then raise exception 'Workspace has no payment actor' using errcode='55000'; end if;
  perform set_config('request.jwt.claim.sub',v_actor::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  v_result:=public.register_invoice_payment(p_invoice_id,p_amount,p_payment_method,p_paid_at,p_idempotency_key,p_external_reference,p_metadata);
  return v_result;
end; $$;
revoke all on function public.register_invoice_payment_service(uuid,uuid,numeric,text,timestamptz,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.register_invoice_payment_service(uuid,uuid,numeric,text,timestamptz,text,text,jsonb) to service_role;

alter table public.activity_logs add column if not exists source_event_id uuid references public.workspace_events(id) on delete set null;
create unique index if not exists activity_logs_source_event_unique on public.activity_logs(source_event_id) where source_event_id is not null;
create or replace function public.project_workspace_event_to_activity_log()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_actor uuid;
begin
  v_actor:=new.actor_user_id;
  if v_actor is null then select user_id into v_actor from public.profiles where company_id=new.company_id order by created_at limit 1; end if;
  if v_actor is null then return new; end if;
  insert into public.activity_logs(company_id,user_id,action_type,entity_type,entity_id,description,metadata,source_event_id,created_at)
  values(new.company_id,v_actor,new.type,new.entity_type,new.entity_id,replace(new.type,'.',' '),
    jsonb_build_object('source',new.source,'correlation_id',new.correlation_id,'payload',new.payload),new.id,new.occurred_at)
  on conflict(source_event_id) where source_event_id is not null do nothing;
  return new;
end; $$;
drop trigger if exists trg_project_workspace_event_activity on public.workspace_events;
create trigger trg_project_workspace_event_activity after insert on public.workspace_events
for each row execute function public.project_workspace_event_to_activity_log();
