-- pgTAP guard for 20261117120000_tenant_scoped_shift_role_checks.sql.
-- Behavioural tests (escalation, cross-tenant, legitimate access) run in
-- supabase/tests/shift_role_functions_test.ts against an isolated PGlite database.
begin;
select plan(6);
select ok(not has_function_privilege('anon','public.can_manage_shifts(uuid)','EXECUTE'),'anon cannot call can_manage_shifts');
select ok(not has_function_privilege('anon','public.can_grant_shift_permissions(uuid)','EXECUTE'),'anon cannot call can_grant_shift_permissions');
select ok(has_function_privilege('authenticated','public.can_manage_shifts(uuid)','EXECUTE'),'RLS (authenticated) can still call can_manage_shifts');
select ok(has_function_privilege('authenticated','public.can_grant_shift_permissions(uuid)','EXECUTE'),'authenticated can still call can_grant_shift_permissions');
select is((select proconfig from pg_proc where oid='public.can_manage_shifts(uuid)'::regprocedure), array['search_path=""'], 'can_manage_shifts has an empty search_path');
select ok(not public.can_manage_shifts(gen_random_uuid()), 'answers false about anyone but the caller');
select * from finish();
rollback;
