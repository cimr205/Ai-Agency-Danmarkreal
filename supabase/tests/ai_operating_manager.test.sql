-- AI Operating Manager database contract.
-- Run after migrations; every fixture is rolled back.
begin;

create temporary table ai_manager_test_context as
select user_id, company_id, gen_random_uuid() as action_id,
  'ai-manager-test-' || gen_random_uuid()::text as idempotency_key
from public.profiles where company_id is not null order by created_at limit 1;

do $$
begin
  if not exists (select 1 from ai_manager_test_context) then
    raise exception 'Test requires one existing authenticated profile';
  end if;
end;
$$;

insert into public.autopilot_actions (
  id, company_id, user_id, action_id, action_type, category, headline,
  status, execution_function, execution_payload, idempotency_key
)
select action_id, company_id, user_id, idempotency_key, 'tasks.create', 'tasks',
  'Operating Manager contract test', 'awaiting_approval', 'tasks.create',
  '{"title":"Contract test"}'::jsonb, idempotency_key
from ai_manager_test_context;

-- A second proposal with the same tenant idempotency key must fail.
do $$
begin
  begin
    insert into public.autopilot_actions (
      company_id, user_id, action_id, action_type, category, headline, status, idempotency_key
    )
    select company_id, user_id, idempotency_key || '-duplicate', 'tasks.create', 'tasks',
      'Duplicate', 'awaiting_approval', idempotency_key
    from ai_manager_test_context;
    raise exception 'Duplicate action execution key was accepted';
  exception when unique_violation then null;
  end;
end;
$$;

grant select on ai_manager_test_context to authenticated, service_role;
select set_config('request.jwt.claim.sub', (select user_id::text from ai_manager_test_context), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare v_ctx ai_manager_test_context;
begin
  select * into v_ctx from ai_manager_test_context;
  if not exists (select 1 from public.autopilot_actions where id = v_ctx.action_id) then
    raise exception 'Tenant member cannot view own action queue';
  end if;
  begin
    perform public.claim_ai_action_execution(v_ctx.action_id, v_ctx.company_id, v_ctx.user_id, false);
    raise exception 'Authenticated browser called service-only action claim';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.autopilot_actions (
      company_id, user_id, action_id, action_type, category, headline, status
    ) values (v_ctx.company_id, v_ctx.user_id, v_ctx.idempotency_key || '-browser', 'tasks.create', 'tasks', 'Browser write', 'awaiting_approval');
    raise exception 'Browser inserted directly into the action queue';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;

do $$
declare
  v_ctx ai_manager_test_context;
  v_claim public.autopilot_actions;
begin
  select * into v_ctx from ai_manager_test_context;
  select * into v_claim from public.claim_ai_action_execution(v_ctx.action_id, v_ctx.company_id, v_ctx.user_id, false);
  if v_claim.status <> 'executing' or v_claim.attempt_count <> 1 then
    raise exception 'First action claim did not transition atomically';
  end if;

  -- A double-click/retry while executing must never claim a second time.
  begin
    perform public.claim_ai_action_execution(v_ctx.action_id, v_ctx.company_id, v_ctx.user_id, false);
    raise exception 'Executing action was claimed twice';
  exception when object_not_in_prerequisite_state then null;
  end;

  update public.autopilot_actions set status = 'completed', result = '{"ok":true}'::jsonb where id = v_ctx.action_id;
  select * into v_claim from public.claim_ai_action_execution(v_ctx.action_id, v_ctx.company_id, v_ctx.user_id, false);
  if v_claim.status <> 'completed' or v_claim.attempt_count <> 1 then
    raise exception 'Completed action was not returned as an idempotent replay';
  end if;
end;
$$;

rollback;

