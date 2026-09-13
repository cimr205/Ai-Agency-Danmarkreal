begin;
select plan(7);

select ok(not has_function_privilege('anon','public.emit_workspace_event(uuid,text,text,text,text,jsonb,uuid,text,text,uuid,uuid,integer,timestamp with time zone)','EXECUTE'),'anon cannot emit canonical events');
select ok(not has_function_privilege('authenticated','public.emit_workspace_event(uuid,text,text,text,text,jsonb,uuid,text,text,uuid,uuid,integer,timestamp with time zone)','EXECUTE'),'authenticated cannot emit canonical events');
select ok(not has_function_privilege('authenticated','public.resolve_external_identity(uuid,uuid,text,text,text,text,text,uuid,jsonb)','EXECUTE'),'authenticated cannot mutate external identities');
select ok(not has_function_privilege('authenticated','public.link_business_entities(uuid,text,uuid,text,text,uuid,uuid,jsonb)','EXECUTE'),'authenticated cannot forge entity relationships');
select ok(not has_function_privilege('authenticated','public.register_invoice_payment_service(uuid,uuid,numeric,text,timestamp with time zone,text,text,jsonb)','EXECUTE'),'authenticated cannot call payment service RPC');
select ok(not has_function_privilege('authenticated','public.claim_workflow_steps(text,integer,integer)','EXECUTE'),'authenticated cannot claim workflow work');
select is((select count(*)::integer from information_schema.role_routine_grants where routine_schema='public' and grantee in ('anon','authenticated') and privilege_type='EXECUTE' and routine_name in ('emit_workspace_event','resolve_external_identity','link_business_entities','register_invoice_payment_service','claim_workflow_steps','reserve_workflow_side_effect','finish_workflow_step','mark_workflow_step_attention','ingest_meta_lead','route_incoming_email','transition_deal_stage_service')),0,'service-only RPC denylist has no browser grants');

select * from finish();
rollback;
