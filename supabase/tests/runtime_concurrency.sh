#!/usr/bin/env bash
set -euo pipefail
db_url="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
psql "$db_url" -v ON_ERROR_STOP=1 <<'SQL'
insert into public.companies(id,name) values('30000000-0000-0000-0000-000000000001','Concurrency Co');
insert into auth.users(id,email) values('30000000-0000-0000-0000-000000000002','concurrency@test.local');
update public.profiles set company_id='30000000-0000-0000-0000-000000000001' where user_id='30000000-0000-0000-0000-000000000002';
insert into public.meta_connections(id,company_id,status) values('30000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','connected');
insert into public.meta_ad_accounts(id,company_id,meta_connection_id,account_id,account_name) values('30000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','concurrent','Concurrent');
insert into public.customers(id,company_id,name,email,record_type,status,created_by) values('30000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000001','Deal Customer','deal@test.local','customer','customer','30000000-0000-0000-0000-000000000002');
insert into public.deals(id,company_id,customer_id,title,value,stage,created_by) values('30000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000005','Concurrent deal',100,'negotiation','30000000-0000-0000-0000-000000000002');
insert into public.invoices(id,company_id,customer_id,invoice_number,amount,status,created_by) values('30000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000005','CONCURRENT-1',100,'sent','30000000-0000-0000-0000-000000000002');
insert into public.workflows(id,company_id,created_by,trigger_event,action_type,description,is_active,steps)
values('30000000-0000-0000-0000-000000000008','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','test.external','workflow_steps','Worker claim test',true,'[{"type":"webhook","url":"https://example.invalid/hook","payload":{}}]');
set request.jwt.claim.role='service_role';
select public.emit_workspace_event('30000000-0000-0000-0000-000000000001','test.external','test','customer','30000000-0000-0000-0000-000000000005','{}',null,'test-worker-event');
SQL

for _ in $(seq 1 10); do
  psql "$db_url" -v ON_ERROR_STOP=1 -c "set request.jwt.claim.role='service_role'; select public.ingest_meta_lead('30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','same-meta-lead','Concurrent Meta','same-meta@test.local');" >/dev/null &
done
wait
for _ in $(seq 1 10); do
  psql "$db_url" -v ON_ERROR_STOP=1 -c "set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='30000000-0000-0000-0000-000000000002'; select public.transition_deal_stage('30000000-0000-0000-0000-000000000006','won',null);" >/dev/null &
done
wait
for _ in $(seq 1 10); do
  psql "$db_url" -v ON_ERROR_STOP=1 -c "set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='30000000-0000-0000-0000-000000000002'; select public.register_invoice_payment('30000000-0000-0000-0000-000000000007',100,'test',now(),'same-payment','provider-payment','{}');" >/dev/null &
done
wait

psql "$db_url" -v ON_ERROR_STOP=1 -c "set request.jwt.claim.role='service_role'; select id from public.claim_workflow_steps('worker-a',1,120);" >/dev/null &
psql "$db_url" -v ON_ERROR_STOP=1 -c "set request.jwt.claim.role='service_role'; select id from public.claim_workflow_steps('worker-b',1,120);" >/dev/null &
wait

psql "$db_url" -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
  if (select count(*) from public.customers where company_id='30000000-0000-0000-0000-000000000001' and normalized_email='same-meta@test.local')<>1 then raise exception 'duplicate Meta contact'; end if;
  if (select count(*) from public.workspace_events where company_id='30000000-0000-0000-0000-000000000001' and idempotency_key='meta:lead:same-meta-lead')<>1 then raise exception 'duplicate Meta event'; end if;
  if (select count(*) from public.workspace_events where company_id='30000000-0000-0000-0000-000000000001' and type='deal.won' and entity_id='30000000-0000-0000-0000-000000000006')<>1 then raise exception 'duplicate deal.won'; end if;
  if (select count(*) from public.tasks where deal_id='30000000-0000-0000-0000-000000000006')<>1 then raise exception 'duplicate onboarding task'; end if;
  if (select count(*) from public.payments where company_id='30000000-0000-0000-0000-000000000001' and idempotency_key='same-payment')<>1 then raise exception 'duplicate payment'; end if;
  if (select count(*) from public.workflow_step_runs where workflow_run_id in (select id from public.workflow_runs where workflow_id='30000000-0000-0000-0000-000000000008') and status='running' and attempt_count=1)<>1 then raise exception 'workflow step was double-claimed'; end if;
end $$;
SQL
