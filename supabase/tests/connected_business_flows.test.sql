-- Runtime contract for the four connected operating-kernel flows.
-- Requires a migrated Supabase database with at least two profiles.
begin;
select plan(1);

do $$
declare
  a record; b record; suffix text:=replace(gen_random_uuid()::text,'-','');
  connection_id uuid; account_id uuid; first_meta jsonb; replay_meta jsonb; contact_id uuid;
  email_account uuid; outbound_id uuid; inbound_id uuid; routed jsonb; v_deal_id uuid; won jsonb; won_replay jsonb;
  invoice_id uuid; payment jsonb; payment_replay jsonb;
begin
  select gen_random_uuid() as user_id,gen_random_uuid() as company_id into a;
  select gen_random_uuid() as user_id,gen_random_uuid() as company_id into b;
  insert into public.companies(id,name) values(a.company_id,'Kernel flow A'),(b.company_id,'Kernel flow B');
  insert into auth.users(id,email) values(a.user_id,'kernel-a-'||suffix||'@test.local'),(b.user_id,'kernel-b-'||suffix||'@test.local');
  update public.profiles set company_id=a.company_id where user_id=a.user_id;
  update public.profiles set company_id=b.company_id where user_id=b.user_id;

  perform set_config('request.jwt.claim.role','service_role',true);
  insert into public.meta_connections(company_id,status,access_token) values(a.company_id,'connected',null) returning id into connection_id;
  insert into public.meta_ad_accounts(company_id,meta_connection_id,account_id,account_name)
    values(a.company_id,connection_id,'test-'||suffix,'Flow test') returning id into account_id;

  first_meta:=public.ingest_meta_lead(a.company_id,account_id,'lead-'||suffix,'Meta Test','meta-'||suffix||'@example.com',null,null,null,null,null,now(),'{}');
  replay_meta:=public.ingest_meta_lead(a.company_id,account_id,'lead-'||suffix,'Ignored','meta-'||suffix||'@example.com',null,null,null,null,null,now(),'{}');
  if first_meta->>'entity_id' is distinct from replay_meta->>'entity_id' or not (replay_meta->>'idempotent_replay')::boolean then raise exception 'Meta replay duplicated lead'; end if;
  contact_id:=(first_meta->>'entity_id')::uuid;
  if not exists(select 1 from public.workflow_runs r join public.workspace_events e on e.id=r.event_id
    where e.company_id=a.company_id and e.type='lead.created' and e.entity_id=contact_id::text) then raise exception 'New-lead workflow was not enqueued'; end if;
  begin
    perform public.ingest_meta_lead(b.company_id,account_id,'cross-'||suffix,'Cross','cross-'||suffix||'@example.com',null,null,null,null,null,now(),'{}');
    raise exception 'Cross-workspace Meta account accepted';
  exception when insufficient_privilege then null; end;

  insert into public.email_accounts(user_id,company_id,provider,email_address,access_token,status)
    values(a.user_id,a.company_id,'gmail','owner-'||suffix||'@example.com','test','connected') returning id into email_account;
  insert into public.emails(email_account_id,company_id,user_id,gmail_id,thread_id,from_address,subject,direction,routing_status,received_at)
    values(email_account,a.company_id,a.user_id,'sent-'||suffix,'thread-'||suffix,'owner-'||suffix||'@example.com','hello','outbound','unmatched',now()-interval '1 minute') returning id into outbound_id;
  insert into public.emails(email_account_id,company_id,user_id,gmail_id,thread_id,from_address,subject,received_at)
    values(email_account,a.company_id,a.user_id,'msg-'||suffix,'thread-'||suffix,'meta-'||suffix||'@example.com','Re: hello',now()) returning id into inbound_id;
  routed:=public.route_incoming_email(a.company_id,inbound_id);
  if routed->>'contact_id' is distinct from contact_id::text then raise exception 'Email did not resolve canonical contact'; end if;
  if routed->>'event_type' is distinct from 'email.replied' then raise exception 'Same-batch outbound history did not classify reply'; end if;
  if not (public.route_incoming_email(a.company_id,inbound_id)->>'idempotent_replay')::boolean then raise exception 'Email replay was not idempotent'; end if;

  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',a.user_id::text,true);
  insert into public.deals(company_id,customer_id,title,value,stage,created_by)
    values(a.company_id,contact_id,'Flow deal',100,'negotiation',a.user_id) returning id into v_deal_id;
  perform set_config('request.jwt.claim.sub',b.user_id::text,true);
  begin
    perform public.transition_deal_stage(v_deal_id,'won',null);
    raise exception 'Cross-workspace deal transition accepted';
  exception when no_data_found then null; end;
  if exists(select 1 from public.get_business_timeline('customer',contact_id,100)) then
    raise exception 'Cross-workspace timeline leaked events';
  end if;
  perform set_config('request.jwt.claim.sub',a.user_id::text,true);
  won:=public.transition_deal_stage(v_deal_id,'won',null);
  won_replay:=public.transition_deal_stage(v_deal_id,'won',null);
  if not (won_replay->>'idempotent_replay')::boolean then raise exception 'Repeated deal win was not idempotent'; end if;
  if (select count(*) from public.tasks where deal_id=v_deal_id and idempotency_key like 'workflow:%')<>1 then raise exception 'Deal onboarding task not created exactly once'; end if;

  insert into public.invoices(company_id,customer_id,invoice_number,amount,status,created_by)
    values(a.company_id,contact_id,'FLOW-'||suffix,100,'sent',a.user_id) returning id into invoice_id;
  perform set_config('request.jwt.claim.sub',b.user_id::text,true);
  begin
    perform public.register_invoice_payment(invoice_id,100,'stripe',now(),'cross-'||suffix,'cross-'||suffix,'{}');
    raise exception 'Cross-workspace payment accepted';
  exception when no_data_found then null; end;
  perform set_config('request.jwt.claim.sub',a.user_id::text,true);
  payment:=public.register_invoice_payment(invoice_id,100,'stripe',now(),'stripe-'||suffix,'ch-'||suffix,'{}');
  payment_replay:=public.register_invoice_payment(invoice_id,100,'stripe',now(),'stripe-'||suffix,'ch-'||suffix,'{}');
  if payment->>'payment_id' is distinct from payment_replay->>'payment_id' then raise exception 'Payment replay duplicated payment'; end if;
  if not exists(select 1 from public.entity_relationships where company_id=a.company_id and from_entity_type='payment' and from_entity_id=(payment->>'payment_id')::uuid and to_entity_id=contact_id) then raise exception 'Payment/customer lineage missing'; end if;
  if not exists(select 1 from public.workspace_events where company_id=a.company_id and type='payment.received' and entity_id=payment->>'payment_id') then raise exception 'Payment event missing'; end if;
end $$;

select pass('connected business flows completed');
select * from finish();
rollback;
