-- Milestone "Paid means paid": server-side access rule (platform audit P0-1).
begin;
select plan(10);

insert into public.companies(id, name) values
  ('83000000-0000-0000-0000-000000000001', 'Access: active'),
  ('83000000-0000-0000-0000-000000000002', 'Access: trial running'),
  ('83000000-0000-0000-0000-000000000003', 'Access: trial expired'),
  ('83000000-0000-0000-0000-000000000004', 'Access: canceled'),
  ('83000000-0000-0000-0000-000000000005', 'Access: active but disabled'),
  ('83000000-0000-0000-0000-000000000006', 'Access: none, no trial');

-- Billing fields are server-owned; set them as the service role.
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
update public.companies set subscription_status = 'active' where id = '83000000-0000-0000-0000-000000000001';
update public.companies set subscription_status = 'trialing', trial_ends_at = now() + interval '2 days' where id = '83000000-0000-0000-0000-000000000002';
update public.companies set subscription_status = 'trialing', trial_ends_at = now() - interval '1 minute' where id = '83000000-0000-0000-0000-000000000003';
update public.companies set subscription_status = 'canceled' where id = '83000000-0000-0000-0000-000000000004';
update public.companies set subscription_status = 'active', disabled = true where id = '83000000-0000-0000-0000-000000000005';

select ok(public.company_has_access('83000000-0000-0000-0000-000000000001'), 'active subscription has access');
select ok(public.company_has_access('83000000-0000-0000-0000-000000000002'), 'running trial has access');
select ok(not public.company_has_access('83000000-0000-0000-0000-000000000003'), 'expired trial has no access');
select ok(not public.company_has_access('83000000-0000-0000-0000-000000000004'), 'canceled subscription has no access');
select ok(not public.company_has_access('83000000-0000-0000-0000-000000000005'), 'disabled company has no access even if active');
select ok(not public.company_has_access('83000000-0000-0000-0000-000000000006'), 'no subscription and no trial has no access');
select ok(not public.company_has_access('83000000-0000-0000-0000-0000000000ff'), 'unknown company has no access');
reset role;

select ok(not has_function_privilege('anon', 'public.company_has_access(uuid)', 'EXECUTE'), 'anon cannot call company_has_access');
select ok(not has_function_privilege('authenticated', 'public.company_has_access(uuid)', 'EXECUTE'), 'authenticated cannot call company_has_access');

-- A browser insert cannot forge a long trial.
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"83000000-0000-0000-0000-0000000000aa"}';
insert into public.companies(id, name, trial_ends_at)
  values ('83000000-0000-0000-0000-000000000007', 'Access: forged trial', now() + interval '50 years');
reset role;
select ok(not public.company_has_access('83000000-0000-0000-0000-000000000007'), 'client insert cannot set trial_ends_at');

select * from finish();
rollback;
