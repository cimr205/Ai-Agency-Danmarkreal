-- Close the remaining provider, actor, workflow-template and privilege gaps.

-- Automated work is represented by a nullable human actor plus actor_type on
-- workspace_events. Provider/service code must never borrow a workspace admin.
alter table public.customers alter column created_by drop not null;
alter table public.tasks alter column created_by drop not null;
alter table public.payments alter column created_by drop not null;
alter table public.workflows alter column created_by drop not null;
alter table public.activity_logs alter column user_id drop not null;

alter table public.emails
  add column if not exists provider_message_id text,
  add column if not exists internet_message_id text,
  add column if not exists in_reply_to text,
  add column if not exists reference_ids text[] not null default '{}';
update public.emails set provider_message_id=gmail_id where provider_message_id is null;
create unique index if not exists emails_account_provider_message_unique
  on public.emails(email_account_id,provider_message_id) where provider_message_id is not null;
create index if not exists emails_account_internet_message_idx
  on public.emails(email_account_id,internet_message_id) where internet_message_id is not null;
create index if not exists emails_account_thread_direction_idx
  on public.emails(email_account_id,thread_id,direction,received_at);

create table if not exists public.invoice_payment_references (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  stripe_checkout_session_id text unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.invoice_payment_references enable row level security;
create policy "Members view invoice payment references" on public.invoice_payment_references
  for select to authenticated using(company_id=public.get_user_company_id(auth.uid()));

create or replace function public.create_invoice_payment_reference(
  p_invoice_id uuid,p_token_hash text,p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_company uuid:=public.get_user_company_id(auth.uid()); v_invoice public.invoices%rowtype; v_id uuid;
begin
  if auth.uid() is null or v_company is null then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_expires_at<=now() or p_expires_at>now()+interval '25 hours' then raise exception 'Invalid reference lifetime' using errcode='22023'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id and company_id=v_company for update;
  if not found then raise exception 'Invoice not found' using errcode='P0002'; end if;
  if v_invoice.status::text in ('paid','cancelled') or v_invoice.voided_at is not null then raise exception 'Invoice is not payable' using errcode='55000'; end if;
  insert into public.invoice_payment_references(company_id,invoice_id,token_hash,expires_at,created_by)
    values(v_company,p_invoice_id,p_token_hash,p_expires_at,auth.uid()) returning id into v_id;
  return jsonb_build_object('reference_id',v_id,'invoice_id',v_invoice.id,'invoice_number',v_invoice.invoice_number,
    'amount',v_invoice.amount,'company_id',v_company,'expires_at',p_expires_at);
end; $$;
revoke all on function public.create_invoice_payment_reference(uuid,text,timestamptz) from public,anon;
grant execute on function public.create_invoice_payment_reference(uuid,text,timestamptz) to authenticated;

create or replace function public.attach_invoice_checkout_session(
  p_reference_id uuid,p_company_id uuid,p_session_id text
) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update public.invoice_payment_references set stripe_checkout_session_id=p_session_id
   where id=p_reference_id and company_id=p_company_id and consumed_at is null and expires_at>now();
  if not found then raise exception 'Payment reference is not active' using errcode='P0002'; end if;
end; $$;
revoke all on function public.attach_invoice_checkout_session(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.attach_invoice_checkout_session(uuid,uuid,text) to service_role;

create or replace function public.resolve_invoice_payment_reference(p_token_hash text,p_session_id text)
returns table(reference_id uuid,company_id uuid,invoice_id uuid,amount numeric)
language plpgsql security definer set search_path=public as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  return query select r.id,r.company_id,r.invoice_id,i.amount
    from public.invoice_payment_references r join public.invoices i on i.id=r.invoice_id and i.company_id=r.company_id
    where r.token_hash=p_token_hash and r.expires_at>now() and r.consumed_at is null
      and (r.stripe_checkout_session_id is null or r.stripe_checkout_session_id=p_session_id)
      and i.status::text not in ('paid','cancelled') and i.voided_at is null
    for update of r;
end; $$;
revoke all on function public.resolve_invoice_payment_reference(text,text) from public,anon,authenticated;
grant execute on function public.resolve_invoice_payment_reference(text,text) to service_role;

create or replace function public.register_invoice_payment_service(
  p_company_id uuid,p_invoice_id uuid,p_amount numeric,p_payment_method text,p_paid_at timestamptz,
  p_idempotency_key text,p_external_reference text,p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_invoice public.invoices%rowtype; v_payment public.payments%rowtype; v_paid numeric; v_remaining numeric;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if coalesce(p_amount,0)<=0 or nullif(trim(coalesce(p_idempotency_key,'')),'') is null then raise exception 'Invalid payment' using errcode='22023'; end if;
  select * into v_invoice from public.invoices where id=p_invoice_id and company_id=p_company_id for update;
  if not found then raise exception 'Invoice does not belong to workspace' using errcode='42501'; end if;
  if v_invoice.status::text='cancelled' or v_invoice.voided_at is not null then raise exception 'Invoice is not payable' using errcode='55000'; end if;
  select * into v_payment from public.payments where company_id=p_company_id and idempotency_key=trim(p_idempotency_key);
  if found then
    if v_payment.invoice_id<>p_invoice_id or v_payment.amount<>p_amount then raise exception 'Idempotency conflict' using errcode='23505'; end if;
    return jsonb_build_object('payment_id',v_payment.id,'invoice_id',p_invoice_id,'idempotent_replay',true);
  end if;
  select coalesce(sum(amount),0) into v_paid from public.payments where invoice_id=p_invoice_id and company_id=p_company_id and status='completed' and reversed_at is null;
  v_remaining:=v_invoice.amount-v_paid;
  if p_amount>v_remaining then raise exception 'Payment exceeds remaining balance' using errcode='22003'; end if;
  insert into public.payments(company_id,invoice_id,amount,status,payment_method,paid_at,created_by,idempotency_key,external_reference,metadata)
    values(p_company_id,p_invoice_id,p_amount,'completed',p_payment_method,coalesce(p_paid_at,now()),null,trim(p_idempotency_key),p_external_reference,coalesce(p_metadata,'{}')) returning * into v_payment;
  v_paid:=v_paid+p_amount;
  update public.invoices set status=case when v_paid>=amount then 'paid'::public.invoice_status when status='draft' then 'sent'::public.invoice_status else status end,
    paid_at=case when v_paid>=amount then coalesce(p_paid_at,now()) else null end,version=version+1,updated_at=now() where id=p_invoice_id;
  return jsonb_build_object('payment_id',v_payment.id,'invoice_id',p_invoice_id,'paid_total',v_paid,'remaining',greatest(v_invoice.amount-v_paid,0),'idempotent_replay',false);
end; $$;
revoke all on function public.register_invoice_payment_service(uuid,uuid,numeric,text,timestamptz,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.register_invoice_payment_service(uuid,uuid,numeric,text,timestamptz,text,text,jsonb) to service_role;

create or replace function public.consume_invoice_payment_reference(p_reference_id uuid,p_company_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  update public.invoice_payment_references set consumed_at=coalesce(consumed_at,now()) where id=p_reference_id and company_id=p_company_id;
  if not found then raise exception 'Payment reference not found' using errcode='P0002'; end if;
end; $$;
revoke all on function public.consume_invoice_payment_reference(uuid,uuid) from public,anon,authenticated;
grant execute on function public.consume_invoice_payment_reference(uuid,uuid) to service_role;

-- Exact message/reply/thread continuity wins. Contact context is only used
-- when unique; multiple active deals stay ambiguous and never use recency.
create or replace function public.route_incoming_email(p_company_id uuid,p_email_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_email public.emails%rowtype; v_parent public.emails%rowtype; v_contact public.customers%rowtype;
  v_contact_count integer:=0; v_deal_count integer:=0; v_deal uuid; v_event uuid; v_type text:='email.received'; v_status text:='unmatched'; v_parent_found boolean:=false;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into v_email from public.emails where id=p_email_id and company_id=p_company_id for update;
  if not found then raise exception 'Email not found' using errcode='P0002'; end if;
  if v_email.source_event_id is not null then return jsonb_build_object('email_id',p_email_id,'event_id',v_email.source_event_id,'idempotent_replay',true); end if;
  if v_email.direction='outbound' then return jsonb_build_object('email_id',p_email_id,'direction','outbound'); end if;

  if nullif(v_email.in_reply_to,'') is not null then
    select * into v_parent from public.emails where company_id=p_company_id and email_account_id=v_email.email_account_id
      and direction='outbound' and internet_message_id=v_email.in_reply_to order by received_at desc limit 1;
    v_parent_found:=found;
  end if;
  if not v_parent_found and nullif(v_email.thread_id,'') is not null then
    select * into v_parent from public.emails where company_id=p_company_id and email_account_id=v_email.email_account_id
      and direction='outbound' and thread_id=v_email.thread_id and id<>v_email.id order by received_at desc limit 1;
    v_parent_found:=found;
  end if;
  if v_parent_found then
    v_contact.id:=v_parent.contact_id; v_deal:=v_parent.deal_id; v_status:=case when v_parent.contact_id is not null then 'matched' else 'unmatched' end; v_type:='email.replied';
  else
    select count(*) into v_contact_count from public.customers where company_id=p_company_id and normalized_email=lower(trim(v_email.from_address));
    if v_contact_count=1 then
      select * into v_contact from public.customers where company_id=p_company_id and normalized_email=lower(trim(v_email.from_address)) limit 1;
      select count(*) into v_deal_count from public.deals where company_id=p_company_id and customer_id=v_contact.id and stage not in ('won','lost');
      if v_deal_count=1 then select id into v_deal from public.deals where company_id=p_company_id and customer_id=v_contact.id and stage not in ('won','lost') limit 1; v_status:='matched';
      elsif v_deal_count>1 then v_status:='ambiguous'; else v_status:='matched'; end if;
    elsif v_contact_count>1 then v_status:='ambiguous'; end if;
  end if;
  v_event:=public.emit_workspace_event(p_company_id,v_type,'gmail',coalesce(v_contact.record_type,'email'),coalesce(v_contact.id::text,p_email_id::text),
    jsonb_build_object('email_id',p_email_id,'thread_id',v_email.thread_id,'from',v_email.from_address,'subject',v_email.subject,'contact_id',v_contact.id,'deal_id',v_deal,'routing_status',v_status),
    null,'gmail:message:'||v_email.email_account_id||':'||v_email.gmail_id,v_email.gmail_id,null,null,1,v_email.received_at);
  update public.emails set contact_id=v_contact.id,deal_id=v_deal,routing_status=v_status,source_event_id=v_event where id=p_email_id;
  return jsonb_build_object('email_id',p_email_id,'event_id',v_event,'event_type',v_type,'contact_id',v_contact.id,'deal_id',v_deal,'routing_status',v_status);
end; $$;
revoke all on function public.route_incoming_email(uuid,uuid) from public,anon,authenticated;
grant execute on function public.route_incoming_email(uuid,uuid) to service_role;

-- Authoritative customer lifecycle publisher includes ordinary lead edits.
create or replace function public.publish_customer_lifecycle_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_type text; v_payload jsonb;
begin
  if tg_op='INSERT' then v_type:=new.record_type||'.created';
  elsif old.record_type='lead' and new.record_type='customer' then v_type:='lead.converted';
  elsif new.record_type='lead' and old.owner_id is distinct from new.owner_id then v_type:='lead.assigned';
  elsif new.record_type='lead' and old.status is distinct from new.status then v_type:=case when new.status::text='qualified' then 'lead.qualified' else 'lead.updated' end;
  elsif new.record_type='lead' and to_jsonb(old)-array['updated_at','source_event_id'] is distinct from to_jsonb(new)-array['updated_at','source_event_id'] then v_type:='lead.updated';
  else return new; end if;
  v_payload:=jsonb_build_object('current',to_jsonb(new),'previous',case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end,'attribution',coalesce(new.attribution,'{}'));
  perform public.emit_workspace_event(new.company_id,v_type,coalesce(new.acquisition_source,'crm'),new.record_type,new.id::text,v_payload,auth.uid(),
    case when tg_op='INSERT' then 'lead:'||new.id||':created' else null end,null,null,new.source_event_id,1,now());
  return new;
end; $$;
drop trigger if exists trg_event_customers on public.customers;
create trigger trg_event_customers after insert or update on public.customers for each row execute function public.publish_customer_lifecycle_change();

-- Templates are global configuration and instantiated without tenant IDs.
create table if not exists public.workflow_templates (
  template_key text primary key, name text not null, trigger_event text not null,
  description text,steps jsonb not null default '[]',requires_approval boolean not null default false,
  version integer not null default 1,is_active boolean not null default true,created_at timestamptz not null default now()
);
alter table public.workflow_templates enable row level security;
create policy "Authenticated users view workflow templates" on public.workflow_templates for select to authenticated using(is_active);
insert into public.workflow_templates(template_key,name,trigger_event,description,steps) values
 ('new-lead-follow-up','New lead follow-up','lead.created','Create a deterministic sales follow-up','[{"type":"create_task","title":"Follow up new lead","priority":"high","due_days":1}]'),
 ('email-reply-pause','Email reply','email.replied','Pause pending follow-up','[{"type":"cancel_followup"}]'),
 ('deal-won-onboarding','Deal won onboarding','deal.won','Create onboarding tasks','[{"type":"create_task","title":"Start customer onboarding","priority":"high","due_days":1}]'),
 ('invoice-paid-follow-up','Invoice paid','invoice.paid','Create payment follow-up','[{"type":"create_task","title":"Follow up successful payment","priority":"medium","due_days":1}]')
on conflict(template_key) do update set name=excluded.name,trigger_event=excluded.trigger_event,description=excluded.description,steps=excluded.steps,version=public.workflow_templates.version+1;

delete from public.workflows where template_key in ('meta-lead-follow-up','reply-stops-follow-up','payment-success');
insert into public.workflows(company_id,created_by,template_key,trigger_event,action_type,description,is_active,steps,requires_approval)
select c.id,null,t.template_key,t.trigger_event,'workflow_steps',t.description,true,t.steps,t.requires_approval
from public.companies c cross join public.workflow_templates t
on conflict(company_id,template_key) where template_key is not null do update set trigger_event=excluded.trigger_event,description=excluded.description,steps=excluded.steps,requires_approval=excluded.requires_approval;

create or replace function public.instantiate_default_workflows()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.workflows(company_id,created_by,template_key,trigger_event,action_type,description,is_active,steps,requires_approval)
  select new.id,null,t.template_key,t.trigger_event,'workflow_steps',t.description,true,t.steps,t.requires_approval from public.workflow_templates t where t.is_active
  on conflict(company_id,template_key) where template_key is not null do nothing;
  return new;
end; $$;
drop trigger if exists trg_seed_operating_workflows on public.profiles;
drop trigger if exists trg_instantiate_default_workflows on public.companies;
create trigger trg_instantiate_default_workflows after insert on public.companies for each row execute function public.instantiate_default_workflows();

-- Service paths no longer choose a human fallback.
create or replace function public.project_workspace_event_to_activity_log()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.activity_logs(company_id,user_id,action_type,entity_type,entity_id,description,metadata,source_event_id,created_at)
  values(new.company_id,new.actor_user_id,new.type,new.entity_type,new.entity_id,replace(new.type,'.',' '),
    jsonb_build_object('source',new.source,'actor_type',new.actor_type,'correlation_id',new.correlation_id,'payload',new.payload),new.id,new.occurred_at)
  on conflict(source_event_id) where source_event_id is not null do nothing;
  return new;
end; $$;

-- Supabase's baseline default routine grants are unsafe for future service RPCs.
alter default privileges in schema public revoke all on routines from public,anon,authenticated;
revoke all on function public.emit_workspace_event(uuid,text,text,text,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.emit_workspace_event(uuid,text,text,text,text,jsonb,uuid,text,text,uuid,uuid,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.resolve_external_identity(uuid,uuid,text,text,text,text,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.link_business_entities(uuid,text,uuid,text,text,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.claim_workflow_runs(text,integer) from public,anon,authenticated;
revoke all on function public.claim_workflow_steps(text,integer,integer) from public,anon,authenticated;
revoke all on function public.reserve_workflow_side_effect(uuid,text,text) from public,anon,authenticated;
revoke all on function public.finish_workflow_step(uuid,text,boolean,jsonb,text,text,boolean) from public,anon,authenticated;
revoke all on function public.mark_workflow_step_attention(uuid,text,text) from public,anon,authenticated;
revoke all on function public.ingest_meta_lead(uuid,uuid,text,text,text,text,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
revoke all on function public.route_incoming_email(uuid,uuid) from public,anon,authenticated;
revoke all on function public.transition_deal_stage_service(uuid,uuid,text,uuid) from public,anon,authenticated;
