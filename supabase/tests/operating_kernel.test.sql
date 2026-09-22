begin;
select plan(18);

select has_column('public', 'workspace_events', 'idempotency_key', 'event ledger has idempotency');
select has_column('public', 'workspace_events', 'correlation_id', 'event ledger preserves correlation');
select has_table('public', 'external_identities', 'external identities are canonical mappings');
select has_table('public', 'entity_relationships', 'cross-module relationships exist');
select has_table('public', 'workflow_runs', 'workflow runs are durable');
select has_table('public', 'workflow_step_runs', 'workflow step history is durable');
select has_index('public', 'workspace_events', 'workspace_events_company_idempotency_unique', 'event idempotency is enforced');
select has_index('public', 'external_identities', 'external_identities_entity_idx', 'canonical identity reverse lookup is indexed');
select col_is_fk('public', 'workflow_runs', 'event_id', 'workflow run references its event');
select col_is_fk('public', 'workflow_runs', 'workflow_id', 'workflow run references its workflow');
select function_returns('public', 'emit_workspace_event', array['uuid','text','text','text','text','jsonb','uuid','text','text','uuid','uuid','integer','timestamp with time zone'], 'uuid', 'event contract returns stable id');
select function_returns('public', 'claim_workflow_runs', array['text','integer'], 'setof public.workflow_runs', 'worker claim contract is available');
select ok(not has_function_privilege('authenticated', 'public.emit_workspace_event(uuid,text,text,text,text,jsonb,uuid)', 'EXECUTE'), 'browser cannot fabricate domain events');
select ok(not has_function_privilege('authenticated', 'public.emit_workspace_event(uuid,text,text,text,text,jsonb,uuid,text,text,uuid,uuid,integer,timestamp with time zone)', 'EXECUTE'), 'browser cannot call extended event publisher');
select ok(not has_function_privilege('authenticated', 'public.resolve_external_identity(uuid,uuid,text,text,text,text,text,uuid,jsonb)', 'EXECUTE'), 'browser cannot forge provider identities');
select ok(not has_function_privilege('authenticated', 'public.link_business_entities(uuid,text,uuid,text,text,uuid,uuid,jsonb)', 'EXECUTE'), 'browser cannot poison entity relationships');
select ok(not has_function_privilege('authenticated', 'public.claim_workflow_runs(text,integer)', 'EXECUTE'), 'browser cannot claim workflow work');
select ok(has_function_privilege('service_role', 'public.claim_workflow_runs(text,integer)', 'EXECUTE'), 'service worker can claim workflow work');

select * from finish();
rollback;
