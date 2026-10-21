begin;
select plan(8);

select has_table('public', 'workflow_templates', 'canonical workflow templates survive the legacy cleanup');
select has_column('public', 'workflow_templates', 'template_key', 'canonical template keys are retained');
select has_table('public', 'invoice_payment_references', 'payment references survive the legacy cleanup');
select has_column('public', 'invoice_payment_references', 'token_hash', 'legacy payment references support hashed tokens');

insert into public.companies(id,name) values('91000000-0000-0000-0000-000000000001','Migration replay fixture');
insert into auth.users(id,email) values('91000000-0000-0000-0000-000000000002','migration-replay@test.local');
update public.profiles set company_id='91000000-0000-0000-0000-000000000001' where user_id='91000000-0000-0000-0000-000000000002';
insert into public.customers(id,company_id,name,email,record_type,status,created_by)
values('91000000-0000-0000-0000-000000000003','91000000-0000-0000-0000-000000000001','Migration customer','migration-customer@test.local','customer','customer','91000000-0000-0000-0000-000000000002');
insert into public.invoices(id,company_id,customer_id,invoice_number,amount,status,created_by)
values('91000000-0000-0000-0000-000000000004','91000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000003','MIGRATION-1',100,'sent','91000000-0000-0000-0000-000000000002');

select is((select count(*)::integer from public.workflows where company_id='91000000-0000-0000-0000-000000000001' and template_key is not null),4,'new companies receive canonical workflows');
set local request.jwt.claim.sub='91000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role='authenticated';
select lives_ok($test$select public.create_invoice_payment_reference('91000000-0000-0000-0000-000000000004','migration-test-token',now()+interval '1 hour')$test$,'canonical checkout creation works on reconciled schema');
select is((select count(*)::integer from public.invoice_payment_references where token_hash='migration-test-token'),1,'checkout reference is persisted once');
select ok(not exists(
  select 1 from pg_policies where schemaname='public' and tablename in ('ai_conversations','ai_messages')
    and cmd in ('ALL','SELECT') and qual not like '%user_id%'
),'reconstructed AI history has no company-wide read policy');

select * from finish();
rollback;
