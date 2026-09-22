-- Connect Meta, email, sales and finance to the shared operating kernel.

alter table public.tasks
  add column if not exists idempotency_key text,
  add column if not exists source_event_id uuid references public.workspace_events(id) on delete set null;
create unique index if not exists tasks_company_idempotency_unique
  on public.tasks(company_id, idempotency_key) where idempotency_key is not null;

alter table public.emails
  add column if not exists contact_id uuid references public.customers(id) on delete set null,
  add column if not exists deal_id uuid references public.deals(id) on delete set null,
  add column if not exists direction text not null default 'inbound' check (direction in ('inbound','outbound')),
  add column if not exists routing_status text not null default 'pending' check (routing_status in ('pending','matched','ambiguous','unmatched')),
  add column if not exists source_event_id uuid references public.workspace_events(id) on delete set null;
create index if not exists emails_contact_timeline_idx on public.emails(company_id, contact_id, received_at desc);
create index if not exists emails_deal_timeline_idx on public.emails(company_id, deal_id, received_at desc);

-- Gmail routing owns email events; remove the generic insert publisher so a
-- replay cannot produce a second, context-free event.
drop trigger if exists trg_event_emails on public.emails;

create or replace function public.ingest_meta_lead(
  p_company_id uuid, p_account_id uuid, p_external_lead_id text,
  p_name text, p_email text, p_phone text default null,
  p_campaign_id text default null, p_adset_id text default null,
  p_ad_id text default null, p_form_id text default null,
  p_created_at timestamptz default now(), p_raw jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_event_id uuid; v_contact public.customers%rowtype; v_identity public.external_identities;
  v_matches integer; v_rules jsonb; v_owner uuid;
  v_campaign uuid; v_adset uuid; v_ad uuid; v_creative uuid;
  v_email text := nullif(lower(trim(coalesce(p_email,''))), '');
  v_phone text := public.normalize_phone_number(p_phone);
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_external_lead_id,'')), '') is null then raise exception 'Meta lead id required' using errcode = '22023'; end if;
  if not exists (select 1 from public.meta_ad_accounts where id=p_account_id and company_id=p_company_id) then
    raise exception 'Meta account does not belong to workspace' using errcode = '42501';
  end if;

  -- One provider lead is resolved at a time. Concurrent sync/webhook delivery
  -- therefore reuses the committed identity instead of racing contact creation.
  perform pg_advisory_xact_lock(hashtextextended(
    p_company_id::text || ':meta:' || p_account_id::text || ':lead:' || p_external_lead_id, 0
  ));

  select * into v_identity from public.external_identities
    where company_id=p_company_id and provider='meta' and external_account_id=p_account_id::text
      and external_entity_type='lead' and external_entity_id=p_external_lead_id;
  if found then return jsonb_build_object('entity_id',v_identity.entity_id,'entity_type',v_identity.entity_type,'idempotent_replay',true); end if;

  select count(*) into v_matches from public.customers
    where company_id=p_company_id and ((v_email is not null and normalized_email=v_email) or (v_phone is not null and normalized_phone=v_phone));
  if v_matches = 1 then
    select * into v_contact from public.customers
      where company_id=p_company_id and ((v_email is not null and normalized_email=v_email) or (v_phone is not null and normalized_phone=v_phone)) limit 1;
  elsif v_matches > 1 then
    v_event_id := public.emit_workspace_event(p_company_id,'marketing.lead_received','meta','lead',null,
      jsonb_build_object('external_lead_id',p_external_lead_id,'identity_resolution','ambiguous','campaign_id',p_campaign_id,'adset_id',p_adset_id,'ad_id',p_ad_id,'form_id',p_form_id),
      null,'meta:lead:'||p_external_lead_id,p_external_lead_id,null,null,1,p_created_at);
    return jsonb_build_object('event_id',v_event_id,'idempotent_replay',false,'ambiguous_identity',true);
  else
    if v_email is null then raise exception 'Meta lead without deterministic email cannot be created safely' using errcode = '22023'; end if;
    insert into public.customers(company_id,name,email,phone,record_type,status,created_by,acquisition_source,acquisition_detail,source_event_id,attribution)
    values(p_company_id,coalesce(nullif(trim(p_name),''),v_email),v_email,p_phone,'lead','new',null,'meta','lead_form',null,
      jsonb_build_object('account_id',p_account_id,'campaign_id',p_campaign_id,'adset_id',p_adset_id,'ad_id',p_ad_id,'form_id',p_form_id,'raw',p_raw))
    returning * into v_contact;
  end if;

  v_event_id := public.emit_workspace_event(
    p_company_id,'marketing.lead_received','meta',v_contact.record_type,v_contact.id::text,
    jsonb_build_object('external_lead_id',p_external_lead_id,'campaign_id',p_campaign_id,'adset_id',p_adset_id,'ad_id',p_ad_id,'form_id',p_form_id),
    null,'meta:lead:'||p_external_lead_id,p_external_lead_id,null,null,1,p_created_at);

  select * into v_identity from public.resolve_external_identity(p_company_id,null,'meta',p_account_id::text,'lead',p_external_lead_id,v_contact.record_type,v_contact.id,p_raw);
  select id into v_campaign from public.meta_campaigns where company_id=p_company_id and meta_campaign_id=p_campaign_id;
  select id into v_adset from public.meta_ad_sets where company_id=p_company_id and meta_ad_set_id=p_adset_id;
  select id,creative_id into v_ad,v_creative from public.meta_ads where company_id=p_company_id and meta_ad_id=p_ad_id;
  if v_campaign is not null then perform public.link_business_entities(p_company_id,v_contact.record_type,v_contact.id,'attributed_to','meta_campaign',v_campaign,v_event_id,'{}'); end if;
  if v_adset is not null then perform public.link_business_entities(p_company_id,v_contact.record_type,v_contact.id,'attributed_to','meta_adset',v_adset,v_event_id,'{}'); end if;
  if v_ad is not null then perform public.link_business_entities(p_company_id,v_contact.record_type,v_contact.id,'attributed_to','meta_ad',v_ad,v_event_id,'{}'); end if;
  if v_creative is not null then perform public.link_business_entities(p_company_id,v_contact.record_type,v_contact.id,'attributed_to','meta_creative',v_creative,v_event_id,'{}'); end if;

  select automation_rules into v_rules from public.companies where id=p_company_id;
  v_owner := nullif(v_rules#>>'{meta_lead_followup,owner_id}','')::uuid;
  if v_owner is not null and exists(select 1 from public.profiles where user_id=v_owner and company_id=p_company_id) then
    update public.customers set owner_id=v_owner where id=v_contact.id and record_type='lead';
  end if;
  update public.customers set source_event_id=coalesce(source_event_id,v_event_id),
    acquisition_source=coalesce(acquisition_source,'meta'), attribution=attribution||jsonb_build_object('campaign_id',p_campaign_id,'adset_id',p_adset_id,'ad_id',p_ad_id,'form_id',p_form_id)
    where id=v_contact.id and company_id=p_company_id;
  return jsonb_build_object('entity_id',v_contact.id,'entity_type',v_contact.record_type,'event_id',v_event_id,'idempotent_replay',false,'ambiguous_identity',false);
end; $$;
revoke all on function public.ingest_meta_lead(uuid,uuid,text,text,text,text,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.ingest_meta_lead(uuid,uuid,text,text,text,text,text,text,text,text,timestamptz,jsonb) to service_role;

create or replace function public.route_incoming_email(p_company_id uuid,p_email_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_email public.emails%rowtype; v_contact public.customers%rowtype; v_count integer; v_deal_count integer; v_deal uuid; v_event uuid; v_type text; v_account_email text;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into v_email from public.emails where id=p_email_id and company_id=p_company_id for update;
  if not found then raise exception 'Email not found' using errcode='P0002'; end if;
  if v_email.source_event_id is not null then return jsonb_build_object('email_id',p_email_id,'event_id',v_email.source_event_id,'idempotent_replay',true); end if;
  select email_address into v_account_email from public.email_accounts where id=v_email.email_account_id and company_id=p_company_id;
  if lower(v_email.from_address)=lower(v_account_email) then
    update public.emails set direction='outbound',routing_status='unmatched' where id=p_email_id;
    return jsonb_build_object('email_id',p_email_id,'direction','outbound');
  end if;
  select count(*) into v_count from public.customers where company_id=p_company_id and normalized_email=lower(trim(v_email.from_address));
  if v_count=1 then
    select * into v_contact from public.customers where company_id=p_company_id and normalized_email=lower(trim(v_email.from_address)) limit 1;
    select count(*) into v_deal_count from public.deals
      where company_id=p_company_id and customer_id=v_contact.id and stage not in ('won','lost');
    if v_deal_count=1 then
      select id into v_deal from public.deals
        where company_id=p_company_id and customer_id=v_contact.id and stage not in ('won','lost') limit 1;
    end if;
  end if;
  v_type := case when exists(select 1 from public.emails e where e.company_id=p_company_id and e.thread_id=v_email.thread_id and e.direction='outbound' and e.id<>p_email_id) then 'email.replied' else 'email.received' end;
  v_event := public.emit_workspace_event(p_company_id,v_type,'gmail',coalesce(v_contact.record_type,'email'),coalesce(v_contact.id::text,p_email_id::text),
    jsonb_build_object('email_id',p_email_id,'thread_id',v_email.thread_id,'from',v_email.from_address,'subject',v_email.subject,'contact_id',v_contact.id,'deal_id',v_deal),
    null,'gmail:message:'||v_email.email_account_id||':'||v_email.gmail_id,v_email.gmail_id,null,null,1,v_email.received_at);
  update public.emails set contact_id=v_contact.id,deal_id=v_deal,routing_status=case when v_count=1 then 'matched' when v_count>1 then 'ambiguous' else 'unmatched' end,source_event_id=v_event where id=p_email_id;
  if v_type='email.replied' and v_contact.id is not null then
    update public.workflow_step_runs s set status='cancelled',completed_at=now(),last_error='Cancelled because contact replied',updated_at=now()
    from public.workflow_runs r, public.workspace_events e
    where s.workflow_run_id=r.id and r.event_id=e.id and r.company_id=p_company_id
      and e.entity_id=v_contact.id::text and s.status in ('pending','waiting') and s.step_type in ('delay','send_email','follow_up');
  end if;
  return jsonb_build_object('email_id',p_email_id,'event_id',v_event,'event_type',v_type,'contact_id',v_contact.id,'deal_id',v_deal,'routing_status',case when v_count=1 then 'matched' when v_count>1 then 'ambiguous' else 'unmatched' end);
end; $$;
revoke all on function public.route_incoming_email(uuid,uuid) from public,anon,authenticated;
grant execute on function public.route_incoming_email(uuid,uuid) to service_role;

alter table public.deals add column if not exists version integer not null default 1;
create or replace function public.transition_deal_stage(p_deal_id uuid,p_target_stage text,p_expected_version integer default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company uuid:=public.get_user_company_id(auth.uid()); v_deal public.deals%rowtype; v_target text:=lower(trim(p_target_stage)); v_event uuid;
begin
  if auth.uid() is null or v_company is null then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_deal from public.deals where id=p_deal_id and company_id=v_company for update;
  if not found then raise exception 'Deal not found' using errcode='P0002'; end if;
  if p_expected_version is not null and v_deal.version<>p_expected_version then raise exception 'Deal changed concurrently' using errcode='40001'; end if;
  if v_deal.stage=v_target then return jsonb_build_object('deal_id',p_deal_id,'stage',v_target,'idempotent_replay',true); end if;
  update public.deals set stage=v_target,version=version+1,updated_at=now() where id=p_deal_id;
  if v_target='won' and v_deal.customer_id is not null then
    select id into v_event from public.workspace_events where company_id=v_company and type='deal.won' and entity_id=p_deal_id::text order by created_at desc limit 1;
    perform public.link_business_entities(v_company,'deal',p_deal_id,'belongs_to','customer',v_deal.customer_id,v_event,'{}');
  end if;
  return jsonb_build_object('deal_id',p_deal_id,'stage',v_target,'idempotent_replay',false);
end; $$;
revoke all on function public.transition_deal_stage(uuid,text,integer) from public;
grant execute on function public.transition_deal_stage(uuid,text,integer) to authenticated;

create or replace function public.transition_deal_stage_service(p_company_id uuid,p_deal_id uuid,p_target_stage text,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_deal public.deals%rowtype; v_target text:=lower(trim(p_target_stage)); v_event uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_actor is not null and not exists(select 1 from public.profiles where user_id=p_actor and company_id=p_company_id) then raise exception 'Actor does not belong to workspace' using errcode='42501'; end if;
  select * into v_deal from public.deals where id=p_deal_id and company_id=p_company_id for update;
  if not found then raise exception 'Deal not found' using errcode='P0002'; end if;
  if v_deal.stage=v_target then return jsonb_build_object('deal_id',p_deal_id,'stage',v_target,'idempotent_replay',true); end if;
  update public.deals set stage=v_target,version=version+1,updated_at=now() where id=p_deal_id;
  if v_target='won' and v_deal.customer_id is not null then
    select id into v_event from public.workspace_events where company_id=p_company_id and type='deal.won' and entity_id=p_deal_id::text order by created_at desc limit 1;
    perform public.link_business_entities(p_company_id,'deal',p_deal_id,'belongs_to','customer',v_deal.customer_id,v_event,'{}');
  end if;
  return jsonb_build_object('deal_id',p_deal_id,'stage',v_target,'idempotent_replay',false);
end; $$;
revoke all on function public.transition_deal_stage_service(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.transition_deal_stage_service(uuid,uuid,text,uuid) to service_role;

-- Payment and invoice triggers already emit canonical events. This adds the
-- customer lineage used by the shared timeline without duplicating payment rows.
create or replace function public.link_payment_to_customer()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_customer uuid; v_event uuid;
begin
  if new.status::text<>'completed' then return new; end if;
  select customer_id into v_customer from public.invoices where id=new.invoice_id and company_id=new.company_id;
  select id into v_event from public.workspace_events where company_id=new.company_id and entity_type='payment' and entity_id=new.id::text order by created_at desc limit 1;
  if v_customer is not null then
    perform public.link_business_entities(new.company_id,'payment',new.id,'paid_by','customer',v_customer,v_event,jsonb_build_object('invoice_id',new.invoice_id));
  end if;
  return new;
end; $$;
drop trigger if exists trg_link_payment_customer on public.payments;
create trigger trg_link_payment_customer after insert or update of status on public.payments for each row execute function public.link_payment_to_customer();

-- The baseline publishers swallowed every exception, allowing a domain write
-- to commit without its durable event. Replace them with fail-closed,
-- idempotent publishers so the row and event are atomic.
create or replace function public.trg_emit_deal_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_type text; v_key text;
begin
  if tg_op='INSERT' then
    v_type := 'deal.created'; v_key := 'deal:'||new.id||':created';
  elsif old.stage is distinct from new.stage then
    v_type := case when lower(new.stage)='won' then 'deal.won' when lower(new.stage)='lost' then 'deal.lost' else 'deal.stage_changed' end;
    v_key := case when lower(new.stage) in ('won','lost') then 'deal:'||new.id||':'||lower(new.stage)
      else 'deal:'||new.id||':stage:'||new.version end;
  else return new;
  end if;
  perform public.emit_workspace_event(new.company_id,v_type,'crm','deal',new.id::text,
    jsonb_build_object('title',new.title,'value',new.value,'from',case when tg_op='UPDATE' then old.stage else null end,'to',new.stage),
    auth.uid(),v_key,null,null,null,1,now());
  return new;
end; $$;

create or replace function public.trg_emit_invoice_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_type text; v_key text;
begin
  if tg_op='INSERT' then v_type:='invoice.created'; v_key:='invoice:'||new.id||':created';
  elsif old.status is distinct from new.status then
    v_type:=case when new.status::text='paid' then 'invoice.paid' else 'invoice.status_changed' end;
    v_key:='invoice:'||new.id||':'||new.status::text;
  else return new; end if;
  perform public.emit_workspace_event(new.company_id,v_type,'finance','invoice',new.id::text,
    jsonb_build_object('number',new.invoice_number,'amount',new.amount,'from',case when tg_op='UPDATE' then old.status::text else null end,'to',new.status::text),
    auth.uid(),v_key,null,null,null,1,now());
  return new;
end; $$;

create or replace function public.trg_emit_task_event()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_type text; v_key text;
begin
  if tg_op='INSERT' then v_type:='task.created'; v_key:='task:'||new.id||':created';
  elsif old.status is distinct from new.status and new.status::text='completed' then
    v_type:='task.completed'; v_key:='task:'||new.id||':completed';
  else return new; end if;
  perform public.emit_workspace_event(new.company_id,v_type,'productivity','task',new.id::text,
    jsonb_build_object('title',new.title,'priority',new.priority,'assigned_to',new.assigned_to),
    auth.uid(),v_key,null,null,null,1,now());
  return new;
end; $$;

create or replace function public.get_business_timeline(p_entity_type text,p_entity_id uuid,p_limit integer default 100)
returns table(id uuid,event_type text,source text,entity_type text,entity_id text,payload jsonb,occurred_at timestamptz)
language sql security definer stable set search_path=public as $$
  select e.id,e.type,e.source,e.entity_type,e.entity_id,e.payload,e.occurred_at
  from public.workspace_events e
  where e.company_id=public.get_user_company_id(auth.uid()) and (
    (e.entity_type=p_entity_type and e.entity_id=p_entity_id::text)
    or exists(select 1 from public.entity_relationships r where r.company_id=e.company_id
      and ((r.from_entity_type=p_entity_type and r.from_entity_id=p_entity_id and r.to_entity_type=e.entity_type and r.to_entity_id::text=e.entity_id)
        or (r.to_entity_type=p_entity_type and r.to_entity_id=p_entity_id and r.from_entity_type=e.entity_type and r.from_entity_id::text=e.entity_id)))
    or (p_entity_type='customer' and e.entity_type='deal' and exists(select 1 from public.deals d where d.id::text=e.entity_id and d.company_id=e.company_id and d.customer_id=p_entity_id))
    or (p_entity_type='customer' and e.entity_type='invoice' and exists(select 1 from public.invoices i where i.id::text=e.entity_id and i.company_id=e.company_id and i.customer_id=p_entity_id))
    or (p_entity_type='customer' and e.entity_type='payment' and exists(select 1 from public.payments p join public.invoices i on i.id=p.invoice_id where p.id::text=e.entity_id and p.company_id=e.company_id and i.customer_id=p_entity_id))
  ) order by e.occurred_at desc limit greatest(1,least(coalesce(p_limit,100),500));
$$;
revoke all on function public.get_business_timeline(text,uuid,integer) from public;
grant execute on function public.get_business_timeline(text,uuid,integer) to authenticated;

alter table public.workflows add column if not exists template_key text;
create unique index if not exists workflows_company_template_unique
  on public.workflows(company_id,template_key) where template_key is not null;

create or replace function public.seed_operating_workflows()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.company_id is null then return new; end if;
  insert into public.workflows(company_id,created_by,template_key,trigger_event,action_type,description,is_active,steps,requires_approval)
  values
    (new.company_id,new.user_id,'meta-lead-follow-up','marketing.lead_received','workflow_steps','Meta lead follow-up',true,'[{"type":"create_task","title":"Follow up new Meta lead","priority":"high"}]',false),
    (new.company_id,new.user_id,'reply-stops-follow-up','email.replied','workflow_steps','Stop pending outreach when a contact replies',true,'[{"type":"cancel_followup"}]',false),
    (new.company_id,new.user_id,'deal-won-onboarding','deal.won','workflow_steps','Start onboarding after a won deal',true,'[{"type":"create_task","title":"Start customer onboarding","priority":"high"}]',false),
    (new.company_id,new.user_id,'payment-success','payment.received','workflow_steps','Record successful payment in the customer lifecycle',true,'[]',false)
  on conflict (company_id,template_key) where template_key is not null do nothing;
  return new;
end; $$;
drop trigger if exists trg_seed_operating_workflows on public.profiles;
create trigger trg_seed_operating_workflows after insert or update of company_id on public.profiles
for each row when (new.company_id is not null) execute function public.seed_operating_workflows();

insert into public.workflows(company_id,created_by,template_key,trigger_event,action_type,description,is_active,steps,requires_approval)
select p.company_id,p.user_id,v.template_key,v.trigger_event,'workflow_steps',v.description,true,v.steps,false
from (select distinct on(company_id) company_id,user_id from public.profiles order by company_id,created_at) p
cross join (values
  ('meta-lead-follow-up','marketing.lead_received','Meta lead follow-up','[{"type":"create_task","title":"Follow up new Meta lead","priority":"high"}]'::jsonb),
  ('reply-stops-follow-up','email.replied','Stop pending outreach when a contact replies','[{"type":"cancel_followup"}]'::jsonb),
  ('deal-won-onboarding','deal.won','Start onboarding after a won deal','[{"type":"create_task","title":"Start customer onboarding","priority":"high"}]'::jsonb),
  ('payment-success','payment.received','Record successful payment in the customer lifecycle','[]'::jsonb)
) v(template_key,trigger_event,description,steps)
on conflict (company_id,template_key) where template_key is not null do nothing;

-- Materialize versioned steps and execute only the explicitly safe internal
-- defaults. External communication/financial actions remain approval-driven.
create or replace function public.enqueue_matching_workflows()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_run record; v_step record; v_task uuid; v_actor uuid; v_lead uuid; v_deal public.deals%rowtype;
begin
  for v_run in
    insert into public.workflow_runs(company_id,workflow_id,workflow_version,event_id,correlation_id,context)
    select new.company_id,w.id,w.version,new.id,new.correlation_id,
      jsonb_build_object('event',new.payload,'entity_type',new.entity_type,'entity_id',new.entity_id)
    from public.workflows w where w.company_id=new.company_id and w.is_active and w.trigger_event=new.type
      and (w.trigger_source is null or w.trigger_source=new.source)
      and (w.conditions='{}'::jsonb or new.payload @> w.conditions)
    on conflict(workflow_id,event_id) do nothing
    returning *
  loop
    v_actor := null;
    for v_step in select value as definition,ordinality::integer-1 as step_index
      from jsonb_array_elements((select steps from public.workflows where id=v_run.workflow_id)) with ordinality
    loop
      insert into public.workflow_step_runs(company_id,workflow_run_id,step_index,step_type,idempotency_key,input,status)
      values(new.company_id,v_run.id,v_step.step_index,v_step.definition->>'type',v_run.id||':'||v_step.step_index,v_step.definition,'running');
      if v_step.definition->>'type'='create_task' then
        v_lead := case when new.entity_type='lead' and new.entity_id~'^[0-9a-f-]{36}$' then new.entity_id::uuid else null end;
        if new.type='deal.won' then
          select * into v_deal from public.deals where id=new.entity_id::uuid and company_id=new.company_id;
        end if;
        insert into public.tasks(company_id,title,description,priority,assigned_to,due_date,created_by,lead_id,deal_id,idempotency_key,source_event_id)
        values(new.company_id,v_step.definition->>'title',coalesce(v_step.definition->>'description','Created by '||new.type),
          coalesce(v_step.definition->>'priority','medium'),coalesce(v_deal.owner_id,v_actor),current_date+coalesce((v_step.definition->>'due_days')::integer,1),
          v_actor,v_lead,case when new.type='deal.won' then v_deal.id else null end,'workflow:'||v_run.id||':'||v_step.step_index,new.id)
        on conflict(company_id,idempotency_key) where idempotency_key is not null do nothing returning id into v_task;
        if v_task is not null and new.entity_id ~ '^[0-9a-f-]{36}$' and new.entity_type in ('lead','customer','deal') then
          perform public.link_business_entities(
            new.company_id,'task',v_task,'relates_to',new.entity_type,new.entity_id::uuid,new.id,
            jsonb_build_object('workflow_run_id',v_run.id,'workflow_step',v_step.step_index)
          );
        end if;
        if v_task is not null and new.type='deal.won' and v_deal.customer_id is not null then
          perform public.link_business_entities(
            new.company_id,'task',v_task,'relates_to','customer',v_deal.customer_id,new.id,
            jsonb_build_object('workflow_run_id',v_run.id,'workflow_step',v_step.step_index,'via_deal_id',v_deal.id)
          );
        end if;
        update public.workflow_step_runs set status='completed',output=jsonb_build_object('task_id',v_task),completed_at=now(),updated_at=now()
          where workflow_run_id=v_run.id and step_index=v_step.step_index;
      elsif v_step.definition->>'type'='cancel_followup' then
        update public.workflow_step_runs set status='completed',output='{"cancelled":true}',completed_at=now(),updated_at=now()
          where workflow_run_id=v_run.id and step_index=v_step.step_index;
      else
        update public.workflow_step_runs set status=case
          when (select requires_approval from public.workflows where id=v_run.workflow_id)
            or coalesce(v_step.definition->>'risk','') in ('high','critical')
          then 'approval_required' else 'pending' end,updated_at=now()
          where workflow_run_id=v_run.id and step_index=v_step.step_index;
      end if;
    end loop;
    update public.workflow_runs set status=case
        when exists(select 1 from public.workflow_step_runs where workflow_run_id=v_run.id and status='approval_required') then 'approval_required'
        when exists(select 1 from public.workflow_step_runs where workflow_run_id=v_run.id and status='pending') then 'queued' else 'completed' end,
      completed_at=case when not exists(select 1 from public.workflow_step_runs where workflow_run_id=v_run.id and status in ('pending','approval_required')) then now() else null end,updated_at=now()
      where id=v_run.id;
  end loop;
  return new;
end; $$;
