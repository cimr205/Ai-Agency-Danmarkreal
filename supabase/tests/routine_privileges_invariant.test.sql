-- Live version of scripts/check-service-only-grants.mjs (which is the
-- version that actually runs in CI today, since CI has no Supabase
-- credentials configured — this queries information_schema directly and
-- is the authoritative check once a real runtime/branch is available).
--
-- Run with: supabase db query --linked -f supabase/tests/routine_privileges_invariant.test.sql
--
-- Read-only — no fixtures inserted, nothing to clean up. Safe to run
-- against a live database including production, since it only reads
-- information_schema.routine_privileges.
--
-- STATUS: executed against the live production project in this session
-- (unlike phase2_flows.test.sql, this makes zero writes — pure
-- information_schema reads — so it does not carry the "never mutate
-- shared production data" risk that blocks the fixture suite). Passed with
-- zero failures at the time it was run.

do $$
declare
  v_bad_grant record;
  v_failures text := '';
  v_service_only text[] := array['ingest_meta_lead', 'register_invoice_payment_service', 'resolve_invoice_payment_reference'];
  v_authenticated_not_anon text[] := array['update_deal_stage', 'update_lead_status', 'update_task_status', 'create_invoice_payment_reference', 'instantiate_workflow_template'];
  v_fn text;
begin
  foreach v_fn in array v_service_only loop
    for v_bad_grant in
      select grantee from information_schema.routine_privileges
      where routine_name = v_fn and routine_schema = 'public' and grantee in ('anon', 'authenticated')
    loop
      v_failures := v_failures || format(E'\n  - %s: unexpectedly callable by %s (must be service_role only)', v_fn, v_bad_grant.grantee);
    end loop;
  end loop;

  foreach v_fn in array v_authenticated_not_anon loop
    for v_bad_grant in
      select grantee from information_schema.routine_privileges
      where routine_name = v_fn and routine_schema = 'public' and grantee = 'anon'
    loop
      v_failures := v_failures || format(E'\n  - %s: unexpectedly callable by anon (must be authenticated only)', v_fn);
    end loop;
  end loop;

  if v_failures <> '' then
    raise exception 'routine_privileges_invariant: FAILED%', v_failures;
  end if;

  raise notice 'routine_privileges_invariant.test.sql: all assertions passed (% functions checked)',
    array_length(v_service_only, 1) + array_length(v_authenticated_not_anon, 1);
end $$;
