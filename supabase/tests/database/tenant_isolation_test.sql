-- Security audit finding L-05: tenant isolation rests entirely on RLS with
-- client-supplied company_id filters. Manual black-box testing confirmed it
-- holds today, but nothing caught a regression automatically. This asserts,
-- per table, that a user in Company A can neither read nor write Company B's
-- rows — run via `supabase test db` (requires local Docker) or directly
-- against a database with `psql -f` / `supabase db query -f` inside a
-- transaction that's rolled back, so it never leaves fixture data behind.
begin;
select plan(18);

-- Fixtures: two companies, one user each, one row per table for Company B.
-- A handle_new_user() trigger auto-creates a public.profiles row (with
-- email, no company_id) on every auth.users insert — give it an email so
-- that insert succeeds, then update the resulting profile with company_id.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'rls-test-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'rls-test-b@test.local');

insert into public.companies (id, name) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'RLS Test Co A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'RLS Test Co B');

update public.profiles set company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', onboarding_completed = true
  where user_id = '11111111-1111-1111-1111-111111111111';
update public.profiles set company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', onboarding_completed = true
  where user_id = '22222222-2222-2222-2222-222222222222';

insert into public.leads (id, company_id, name, email, status, created_by) values
  ('c0000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B Lead', 'blead@test.local', 'new', '22222222-2222-2222-2222-222222222222');

insert into public.deals (id, company_id, title, stage, value, created_by) values
  ('c0000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B Deal', 'discovery', 1000, '22222222-2222-2222-2222-222222222222');

insert into public.customers (id, company_id, name, email, created_by) values
  ('c0000000-0000-0000-0000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B Customer', 'bcust@test.local', '22222222-2222-2222-2222-222222222222');

insert into public.invoices (id, company_id, invoice_number, amount, customer_id, status, created_by) values
  ('c0000000-0000-0000-0000-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B-INV-1', 500, 'c0000000-0000-0000-0000-000000000003', 'draft', '22222222-2222-2222-2222-222222222222');

insert into public.tasks (id, company_id, title, status, created_by) values
  ('c0000000-0000-0000-0000-000000000005', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B Task', 'pending', '22222222-2222-2222-2222-222222222222');

insert into public.employee_profiles (id, company_id, full_name, email, employee_id, user_id, created_by) values
  ('c0000000-0000-0000-0000-000000000006', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B Employee', 'bemp@test.local', 'EMP-B-1', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222');

-- Simulate being authenticated as User A (Company A) for the rest of the test.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

-- Cross-tenant READ isolation: User A must not see any Company B row.
select is((select count(*)::int from public.leads where id = 'c0000000-0000-0000-0000-000000000001'), 0, 'leads: User A cannot read Company B row');
select is((select count(*)::int from public.deals where id = 'c0000000-0000-0000-0000-000000000002'), 0, 'deals: User A cannot read Company B row');
select is((select count(*)::int from public.customers where id = 'c0000000-0000-0000-0000-000000000003'), 0, 'customers: User A cannot read Company B row');
select is((select count(*)::int from public.invoices where id = 'c0000000-0000-0000-0000-000000000004'), 0, 'invoices: User A cannot read Company B row');
select is((select count(*)::int from public.tasks where id = 'c0000000-0000-0000-0000-000000000005'), 0, 'tasks: User A cannot read Company B row');
select is((select count(*)::int from public.employee_profiles where id = 'c0000000-0000-0000-0000-000000000006'), 0, 'employee_profiles: User A cannot read Company B row');

-- Cross-tenant WRITE isolation: User A must not be able to insert a row
-- claiming Company B's company_id (RLS violation raises SQLSTATE 42501).
select throws_ok(
  $$insert into public.leads (company_id, name, email, status, created_by) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Hacked Lead', 'hack@test.local', 'new', '11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'leads: User A cannot insert a row into Company B'
);
select throws_ok(
  $$insert into public.deals (company_id, title, stage, value, created_by) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Hacked Deal', 'discovery', 1, '11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'deals: User A cannot insert a row into Company B'
);
select throws_ok(
  $$insert into public.customers (company_id, name, email, created_by) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Hacked Customer', 'hackc@test.local', '11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'customers: User A cannot insert a row into Company B'
);
select throws_ok(
  $$insert into public.invoices (company_id, invoice_number, amount, customer_id, status, created_by) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'HACK-1', 1, 'c0000000-0000-0000-0000-000000000003', 'draft', '11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'invoices: User A cannot insert a row into Company B'
);
select throws_ok(
  $$insert into public.tasks (company_id, title, status, created_by) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Hacked Task', 'pending', '11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'tasks: User A cannot insert a row into Company B'
);
select throws_ok(
  $$insert into public.employee_profiles (company_id, full_name, email, employee_id, user_id, created_by) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Hacked Employee', 'hacke@test.local', 'EMP-HACK-1', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'employee_profiles: User A cannot insert a row into Company B'
);

-- Sanity check: User A CAN still read/write within their own company (a
-- suite that blocks everything, including same-tenant access, would be
-- useless as a regression guard).
insert into public.leads (id, company_id, name, email, status, created_by) values
  ('c0000000-0000-0000-0000-000000000011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A Lead', 'alead@test.local', 'new', '11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.leads where id = 'c0000000-0000-0000-0000-000000000011'), 1, 'leads: User A can read/write their own company row');

insert into public.deals (id, company_id, title, stage, value, created_by) values
  ('c0000000-0000-0000-0000-000000000012', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A Deal', 'discovery', 1, '11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.deals where id = 'c0000000-0000-0000-0000-000000000012'), 1, 'deals: User A can read/write their own company row');

insert into public.customers (id, company_id, name, email, created_by) values
  ('c0000000-0000-0000-0000-000000000013', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A Customer', 'acust@test.local', '11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.customers where id = 'c0000000-0000-0000-0000-000000000013'), 1, 'customers: User A can read/write their own company row');

insert into public.tasks (id, company_id, title, status, created_by) values
  ('c0000000-0000-0000-0000-000000000014', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A Task', 'pending', '11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.tasks where id = 'c0000000-0000-0000-0000-000000000014'), 1, 'tasks: User A can read/write their own company row');

insert into public.employee_profiles (id, company_id, full_name, email, employee_id, user_id, created_by) values
  ('c0000000-0000-0000-0000-000000000016', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A Employee', 'aemp@test.local', 'EMP-A-1', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.employee_profiles where id = 'c0000000-0000-0000-0000-000000000016'), 1, 'employee_profiles: User A can read/write their own company row');

insert into public.invoices (id, company_id, invoice_number, amount, customer_id, status, created_by) values
  ('c0000000-0000-0000-0000-000000000015', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A-INV-1', 1, 'c0000000-0000-0000-0000-000000000013', 'draft', '11111111-1111-1111-1111-111111111111');
select is((select count(*)::int from public.invoices where id = 'c0000000-0000-0000-0000-000000000015'), 1, 'invoices: User A can read/write their own company row');

select * from finish();
rollback;
