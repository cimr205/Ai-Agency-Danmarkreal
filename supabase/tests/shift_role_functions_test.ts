// Isolated database test for 20261117120000_tenant_scoped_shift_role_checks.sql.
// PGlite (Postgres compiled to WASM) gets a stand-in for the Supabase pieces the
// shift module depends on, the PRE-fix function definitions (the rollback file,
// i.e. production on 2026-11-17) and the exact RLS policies read from production
// pg_policies. It first proves the two weaknesses, then applies the migration and
// checks that they are closed and that legitimate access is unchanged.
// Run: deno test --node-modules-dir=none --allow-read --allow-env supabase/tests/shift_role_functions_test.ts
import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const MIGRATION = await read("../migrations/20261117120000_tenant_scoped_shift_role_checks.sql");
const BEFORE = await read("../rollbacks/20261117120000_tenant_scoped_shift_role_checks.down.sql");

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const U = {
  ownerA: "a0000000-0000-0000-0000-000000000001",
  adminA: "a0000000-0000-0000-0000-000000000002",
  mgrA: "a0000000-0000-0000-0000-000000000003",
  empA: "a0000000-0000-0000-0000-000000000004",
  roA: "a0000000-0000-0000-0000-000000000005",
  // Works in A as an employee, but still has a manager row from company B.
  staleA: "a0000000-0000-0000-0000-000000000006",
  sysA: "a0000000-0000-0000-0000-000000000007",
  mgrB: "b0000000-0000-0000-0000-000000000001",
};
const EMP_A = "e0000000-0000-0000-0000-00000000000a";
const SHIFT_A_OPEN = "5a000000-0000-0000-0000-000000000001";
const SHIFT_A_TAKEN = "5a000000-0000-0000-0000-000000000002";
const SHIFT_B = "5b000000-0000-0000-0000-000000000001";

const STANDIN = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create type public.app_role as enum ('system_admin','company_admin','manager','employee','readonly','partner','owner');
create table public.companies (id uuid primary key);
create table public.profiles (user_id uuid primary key, company_id uuid references public.companies(id));
create table public.employee_profiles (id uuid primary key, user_id uuid, company_id uuid, is_active boolean default true);
create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid, role public.app_role, company_id uuid, can_grant_permissions boolean default false);
-- production definition (2026-11-17)
create function public.get_user_company_id(_user_id uuid) returns uuid language sql stable security definer set search_path to 'public' as $$
  SELECT p.company_id FROM public.profiles p WHERE p.user_id = _user_id
    AND NOT EXISTS (SELECT 1 FROM public.employee_profiles ep WHERE ep.user_id = _user_id AND ep.is_active = false) $$;
create table public.departments (id uuid primary key default gen_random_uuid(), company_id uuid not null, name text);
create table public.shifts (id uuid primary key default gen_random_uuid(), company_id uuid not null, status text default 'open', assigned_employee_id uuid, created_by uuid);
create table public.shift_applications (id uuid primary key default gen_random_uuid(), shift_id uuid references public.shifts(id), employee_id uuid, status text default 'pending');
alter table public.departments enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_applications enable row level security;
grant select, insert, update, delete on public.departments, public.shifts, public.shift_applications to anon, authenticated;
grant select on public.employee_profiles to anon, authenticated;
`;

// Policies exactly as in production pg_policies (2026-11-17).
const POLICIES = `
create policy "Managers can create departments" on public.departments for insert with check ((company_id = get_user_company_id(auth.uid())) AND can_manage_shifts(auth.uid()));
create policy "Managers can update departments" on public.departments for update using ((company_id = get_user_company_id(auth.uid())) AND can_manage_shifts(auth.uid())) with check ((company_id = get_user_company_id(auth.uid())) AND can_manage_shifts(auth.uid()));
create policy "Managers can delete departments" on public.departments for delete using ((company_id = get_user_company_id(auth.uid())) AND can_manage_shifts(auth.uid()));
create policy "View departments" on public.departments for select using (company_id = get_user_company_id(auth.uid()));
create policy "View shifts in own company" on public.shifts for select using ((company_id = get_user_company_id(auth.uid())) AND (can_manage_shifts(auth.uid()) OR (status = 'open'::text) OR (assigned_employee_id IN ( SELECT employee_profiles.id FROM employee_profiles WHERE (employee_profiles.user_id = auth.uid())))));
create policy "Managers can create shifts" on public.shifts for insert with check ((company_id = get_user_company_id(auth.uid())) AND can_manage_shifts(auth.uid()) AND (created_by = auth.uid()));
create policy "Managers can update shifts" on public.shifts for update using ((company_id = get_user_company_id(auth.uid())) AND can_manage_shifts(auth.uid())) with check ((company_id = get_user_company_id(auth.uid())) AND can_manage_shifts(auth.uid()));
create policy "Managers can delete shifts" on public.shifts for delete using ((company_id = get_user_company_id(auth.uid())) AND can_manage_shifts(auth.uid()));
create policy "View shift applications" on public.shift_applications for select using ((employee_id IN ( SELECT employee_profiles.id FROM employee_profiles WHERE (employee_profiles.user_id = auth.uid()))) OR (shift_id IN ( SELECT shifts.id FROM shifts WHERE ((shifts.company_id = get_user_company_id(auth.uid())) AND can_manage_shifts(auth.uid())))));
create policy "Managers can review shift applications" on public.shift_applications for update using (shift_id IN ( SELECT shifts.id FROM shifts WHERE ((shifts.company_id = get_user_company_id(auth.uid())) AND can_manage_shifts(auth.uid())))) with check (shift_id IN ( SELECT shifts.id FROM shifts WHERE ((shifts.company_id = get_user_company_id(auth.uid())) AND can_manage_shifts(auth.uid()))));
`;

const SEED = `
insert into public.companies values ('${A}'),('${B}');
insert into public.profiles values ('${U.ownerA}','${A}'),('${U.adminA}','${A}'),('${U.mgrA}','${A}'),('${U.empA}','${A}'),('${U.roA}','${A}'),('${U.staleA}','${A}'),('${U.sysA}','${A}'),('${U.mgrB}','${B}');
insert into public.employee_profiles values ('${EMP_A}','${U.empA}','${A}',true);
insert into public.user_roles (user_id, role, company_id, can_grant_permissions) values
  ('${U.ownerA}','owner','${A}',false),('${U.adminA}','company_admin','${A}',false),('${U.mgrA}','manager','${A}',true),
  ('${U.empA}','employee','${A}',false),('${U.roA}','readonly','${A}',false),
  ('${U.staleA}','employee','${A}',false),('${U.staleA}','manager','${B}',true),
  ('${U.sysA}','system_admin',null,false),('${U.mgrB}','manager','${B}',false);
insert into public.shifts (id, company_id, status, assigned_employee_id) values
  ('${SHIFT_A_OPEN}','${A}','open',null),('${SHIFT_A_TAKEN}','${A}','assigned',null),('${SHIFT_B}','${B}','open',null);
insert into public.shift_applications (shift_id, employee_id) values ('${SHIFT_A_OPEN}','${EMP_A}'),('${SHIFT_B}',gen_random_uuid());
insert into public.departments (company_id, name) values ('${A}','Sales A'),('${B}','Sales B');
`;

async function setup(fixed: boolean) {
  const db = new PGlite();
  await db.exec(STANDIN);
  await db.exec(BEFORE);
  await db.exec(POLICIES);
  await db.exec(SEED);
  if (fixed) await db.exec(MIGRATION);
  return db;
}

async function as<T>(db: PGlite, user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ""}', false);`);
  await db.exec(user ? "set role authenticated" : "set role anon");
  try { return await fn(); } finally { await db.exec("reset role"); }
}

const can = async (db: PGlite, user: string | null, fnName: string, about: string | null) =>
  (await as(db, user, () => db.query<{ ok: boolean }>(`select public.${fnName}($1::uuid) as ok`, [about]))).rows[0].ok;

const insertShift = (db: PGlite, user: string, company: string) =>
  as(db, user, () => db.query(`insert into public.shifts (company_id, status, created_by) values ($1, 'open', $2)`, [company, user]));

const updateShift = async (db: PGlite, user: string, id: string) =>
  (await as(db, user, () => db.query(`update public.shifts set status = 'cancelled' where id = $1`, [id]))).affectedRows ?? 0;

const visibleShifts = async (db: PGlite, user: string) =>
  (await as(db, user, () => db.query<{ id: string }>(`select id from public.shifts order by id`))).rows.map((r) => r.id);

// ── the weaknesses, proven on the pre-fix definitions ───────────────────────
Deno.test("before: a foreign-company manager row grants shift management in the user's own company", async () => {
  const db = await setup(false);
  assert(await can(db, U.staleA, "can_manage_shifts", U.staleA));
  await insertShift(db, U.staleA, A); // succeeds: privilege escalation
  assertEquals(await updateShift(db, U.staleA, SHIFT_A_TAKEN), 1);
});

Deno.test("before: anyone, even anonymous, can probe another user's roles", async () => {
  const db = await setup(false);
  assert(await can(db, null, "can_manage_shifts", U.mgrA));
  assert(await can(db, U.empA, "can_grant_shift_permissions", U.mgrA));
});

// ── after the migration ────────────────────────────────────────────────────
Deno.test("after: anonymous callers cannot execute either function", async () => {
  const db = await setup(true);
  await assertRejects(() => can(db, null, "can_manage_shifts", U.mgrA), Error, "permission denied");
  await assertRejects(() => can(db, null, "can_grant_shift_permissions", U.mgrA), Error, "permission denied");
});

Deno.test("after: a signed-in user cannot learn another user's roles (arguments are ignored)", async () => {
  const db = await setup(true);
  assertEquals(await can(db, U.empA, "can_manage_shifts", U.mgrA), false);
  assertEquals(await can(db, U.empA, "can_grant_shift_permissions", U.ownerA), false);
  assertEquals(await can(db, U.mgrA, "can_manage_shifts", U.mgrA), true);
});

Deno.test("after: a role row from another company no longer escalates", async () => {
  const db = await setup(true);
  assertEquals(await can(db, U.staleA, "can_manage_shifts", U.staleA), false);
  assertEquals(await can(db, U.staleA, "can_grant_shift_permissions", U.staleA), false);
  await assertRejects(() => insertShift(db, U.staleA, A), Error, "row-level security");
  assertEquals(await updateShift(db, U.staleA, SHIFT_A_TAKEN), 0);
});

Deno.test("after: owner, company_admin, manager and system_admin keep legitimate access in their company", async () => {
  const db = await setup(true);
  for (const u of [U.ownerA, U.adminA, U.mgrA, U.sysA]) {
    assert(await can(db, u, "can_manage_shifts", u), u);
    await insertShift(db, u, A);
    assertEquals(await updateShift(db, u, SHIFT_A_TAKEN), 1, u);
    assertEquals((await visibleShifts(db, u)).includes(SHIFT_A_TAKEN), true, u);
  }
  // departments
  await as(db, U.mgrA, () => db.query(`insert into public.departments (company_id, name) values ($1, 'Ops')`, [A]));
  const del = await as(db, U.adminA, () => db.query(`delete from public.departments where name = 'Ops'`));
  assertEquals(del.affectedRows, 1);
});

Deno.test("after: permission granting follows the role exactly", async () => {
  const db = await setup(true);
  assert(await can(db, U.ownerA, "can_grant_shift_permissions", U.ownerA));
  assert(await can(db, U.adminA, "can_grant_shift_permissions", U.adminA));
  assert(await can(db, U.mgrA, "can_grant_shift_permissions", U.mgrA)); // manager with can_grant_permissions
  assertEquals(await can(db, U.mgrB, "can_grant_shift_permissions", U.mgrB), false); // manager without it
  assertEquals(await can(db, U.empA, "can_grant_shift_permissions", U.empA), false);
});

Deno.test("after: employee and readonly cannot write; employee still sees open and own shifts", async () => {
  const db = await setup(true);
  for (const u of [U.empA, U.roA]) {
    await assertRejects(() => insertShift(db, u, A), Error, "row-level security");
    assertEquals(await updateShift(db, u, SHIFT_A_OPEN), 0, u);
    await assertRejects(() => as(db, u, () => db.query(`insert into public.departments (company_id, name) values ($1, 'x')`, [A])), Error, "row-level security");
  }
  assertEquals(await visibleShifts(db, U.empA), [SHIFT_A_OPEN]); // open shift yes, assigned-to-someone-else no
  const apps = await as(db, U.empA, () => db.query(`select employee_id from public.shift_applications`));
  assertEquals(apps.rows.length, 1); // only their own application
});

Deno.test("after: company A can never change company B", async () => {
  const db = await setup(true);
  await assertRejects(() => insertShift(db, U.mgrA, B), Error, "row-level security");
  assertEquals(await updateShift(db, U.mgrA, SHIFT_B), 0);
  assertEquals((await visibleShifts(db, U.mgrA)).includes(SHIFT_B), false);
  const reviewed = await as(db, U.mgrA, () => db.query(`update public.shift_applications set status = 'approved' where shift_id = $1`, [SHIFT_B]));
  assertEquals(reviewed.affectedRows, 0);
  const own = await as(db, U.mgrA, () => db.query(`update public.shift_applications set status = 'approved' where shift_id = $1`, [SHIFT_A_OPEN]));
  assertEquals(own.affectedRows, 1);
  // and B's manager sees nothing of A
  assertEquals((await visibleShifts(db, U.mgrB)), [SHIFT_B]);
});

Deno.test("after: direct RPC with a forged user id does not bypass RLS", async () => {
  const db = await setup(true);
  // empA asks "can mgrA manage shifts?" hoping to reuse the answer: false, and writes still fail.
  assertEquals(await can(db, U.empA, "can_manage_shifts", U.mgrA), false);
  await assertRejects(() => insertShift(db, U.empA, A), Error, "row-level security");
});

Deno.test("after: search_path is empty and grants are exact", async () => {
  const db = await setup(true);
  const r = await db.query<{ proname: string; cfg: string[]; anon: boolean; authed: boolean; svc: boolean }>(`
    select proname, proconfig as cfg,
      has_function_privilege('anon', oid, 'execute') as anon,
      has_function_privilege('authenticated', oid, 'execute') as authed,
      has_function_privilege('service_role', oid, 'execute') as svc
    from pg_proc where proname in ('can_manage_shifts','can_grant_shift_permissions') order by proname`);
  for (const row of r.rows) {
    assertEquals(row.cfg, ['search_path=""'], row.proname);
    assertEquals([row.anon, row.authed, row.svc], [false, true, true], row.proname);
  }
});
