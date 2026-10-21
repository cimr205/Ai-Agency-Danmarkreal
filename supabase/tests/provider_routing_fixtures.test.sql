begin;
select plan(13);

insert into public.companies(id,name) values('83000000-0000-0000-0000-000000000001','Provider fixture tenant');
insert into auth.users(id,email) values('83000000-0000-0000-0000-000000000002','provider-fixture@test.local');
update public.profiles set company_id='83000000-0000-0000-0000-000000000001' where user_id='83000000-0000-0000-0000-000000000002';
insert into public.email_accounts(id,user_id,company_id,email_address,access_token)
values('83000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000002','83000000-0000-0000-0000-000000000001','owner@test.local','fixture');
insert into public.customers(id,company_id,name,email,record_type,created_by)
values('83000000-0000-0000-0000-000000000004','83000000-0000-0000-0000-000000000001','Known contact','known@test.local','customer','83000000-0000-0000-0000-000000000002');
insert into public.deals(id,company_id,customer_id,title,created_by)
values('83000000-0000-0000-0000-000000000005','83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000004','Known deal','83000000-0000-0000-0000-000000000002');

insert into public.emails(id,email_account_id,company_id,user_id,gmail_id,provider_message_id,thread_id,internet_message_id,from_address,to_addresses,direction,routing_status,contact_id,deal_id,received_at)
values('83000000-0000-0000-0000-000000000006','83000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000002','out-1','out-1','thread-1','<out-1@test>','owner@test.local','["known@test.local"]','outbound','matched','83000000-0000-0000-0000-000000000004','83000000-0000-0000-0000-000000000005',now()-interval '1 minute');
insert into public.emails(id,email_account_id,company_id,user_id,gmail_id,provider_message_id,thread_id,internet_message_id,in_reply_to,from_address,to_addresses,direction,received_at)
values('83000000-0000-0000-0000-000000000007','83000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000002','in-1','in-1','thread-1','<in-1@test>','<out-1@test>','known@test.local','["owner@test.local"]','inbound',now());
select set_config('request.jwt.claim.role','service_role',true);
select public.route_incoming_email('83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000007');
select is((select routing_status from public.emails where id='83000000-0000-0000-0000-000000000007'),'matched','known outbound reply is matched');
select is((select contact_id from public.emails where id='83000000-0000-0000-0000-000000000007'),'83000000-0000-0000-0000-000000000004'::uuid,'reply inherits exact contact');
select is((select deal_id from public.emails where id='83000000-0000-0000-0000-000000000007'),'83000000-0000-0000-0000-000000000005'::uuid,'reply inherits exact deal');
select is((select type from public.workspace_events where external_event_id='in-1'),'email.replied','deterministic continuity emits replied');
select lives_ok($$select public.route_incoming_email('83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000007')$$,'duplicate inbound routing is idempotent');
select is((select count(*)::integer from public.workspace_events where external_event_id='in-1'),1,'duplicate inbound creates one event');

insert into public.customers(id,company_id,name,email,record_type,created_by) values
 ('83000000-0000-0000-0000-000000000008','83000000-0000-0000-0000-000000000001','Ambiguous one','same@test.local','customer','83000000-0000-0000-0000-000000000002'),
 ('83000000-0000-0000-0000-000000000009','83000000-0000-0000-0000-000000000001','Ambiguous two','same@test.local','lead','83000000-0000-0000-0000-000000000002');
insert into public.emails(id,email_account_id,company_id,user_id,gmail_id,provider_message_id,from_address,direction,received_at)
values('83000000-0000-0000-0000-000000000010','83000000-0000-0000-0000-000000000003','83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000002','in-amb','in-amb','same@test.local','inbound',now());
select public.route_incoming_email('83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000010');
select is((select routing_status from public.emails where id='83000000-0000-0000-0000-000000000010'),'ambiguous','ambiguous customer remains unresolved');
select is((select contact_id from public.emails where id='83000000-0000-0000-0000-000000000010'),null::uuid,'ambiguous customer is not guessed');
select is((select type from public.workspace_events where external_event_id='in-amb'),'email.received','missing outbound history never emits replied');

insert into public.invoices(id,company_id,customer_id,invoice_number,amount,status,created_by)
values('83000000-0000-0000-0000-000000000011','83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000004','FIXTURE-1',100,'sent','83000000-0000-0000-0000-000000000002');
insert into public.invoice_payment_references(id,company_id,invoice_id,token_hash,expires_at,stripe_checkout_session_id) values
 ('83000000-0000-0000-0000-000000000012','83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000011','valid-hash',now()+interval '1 hour','cs_valid'),
 ('83000000-0000-0000-0000-000000000013','83000000-0000-0000-0000-000000000001','83000000-0000-0000-0000-000000000011','expired-hash',now()-interval '1 hour','cs_expired');
select is((select count(*)::integer from public.resolve_invoice_payment_reference('valid-hash','cs_valid')),1,'valid checkout reference resolves exactly once');
select is((select count(*)::integer from public.resolve_invoice_payment_reference('expired-hash','cs_expired')),0,'expired checkout reference fails safely');
select ok(not has_function_privilege('authenticated','public.resolve_invoice_payment_reference(text,text)','EXECUTE'),'browser cannot resolve invoice references');
select ok(not has_function_privilege('authenticated','public.consume_invoice_payment_reference(uuid,uuid)','EXECUTE'),'browser cannot consume invoice references');

select * from finish();
rollback;
