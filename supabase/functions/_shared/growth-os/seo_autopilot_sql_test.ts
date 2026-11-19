// PGlite test of 20261118120000_growth_os_seo_autopilot.sql on top of the Growth OS
// foundation + analytics migrations and a stand-in for the Supabase pieces they use.
// Run: deno test --node-modules-dir=none --allow-read --allow-env supabase/functions/_shared/growth-os/seo_autopilot_sql_test.ts
import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const FOUNDATION = await read("../../../migrations/20261114120000_growth_os_foundation.sql");
const ANALYTICS = await read("../../../migrations/20261117130000_growth_os_analytics.sql");
const AUTOPILOT = await read("../../../migrations/20261118120000_growth_os_seo_autopilot.sql");

const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
const U = { ownerA: "a0000000-0000-0000-0000-000000000001", mgrA: "a0000000-0000-0000-0000-000000000002", empA: "a0000000-0000-0000-0000-000000000003", ownerB: "b0000000-0000-0000-0000-000000000001", sys: "c0000000-0000-0000-0000-000000000001" };

const STANDIN = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create type public.app_role as enum ('owner','company_admin','manager','employee','readonly','partner','system_admin');
create type public.lead_status as enum ('new','contacted','qualified','unqualified','customer');
create type public.invoice_status as enum ('draft','sent','paid','overdue','cancelled');
create table public.companies (id uuid primary key);
create table public.profiles (user_id uuid primary key, company_id uuid);
create table public.user_roles (user_id uuid, role public.app_role, company_id uuid);
create function public.get_user_company_id(_user_id uuid) returns uuid language sql stable security definer set search_path to 'public' as $$ select company_id from public.profiles where user_id = _user_id $$;
create table public.customers (id uuid primary key default gen_random_uuid(), company_id uuid, record_type text, status public.lead_status, converted_at timestamptz, created_at timestamptz default now(), acquisition_source text, lead_source text);
create table public.invoices (id uuid primary key default gen_random_uuid(), company_id uuid, customer_id uuid, amount numeric, status public.invoice_status, paid_at timestamptz);
insert into public.companies values ('${A}'),('${B}');
insert into public.profiles values ('${U.ownerA}','${A}'),('${U.mgrA}','${A}'),('${U.empA}','${A}'),('${U.ownerB}','${B}'),('${U.sys}','${A}');
insert into public.user_roles values ('${U.ownerA}','owner','${A}'),('${U.mgrA}','manager','${A}'),('${U.empA}','employee','${A}'),('${U.ownerB}','owner','${B}'),('${U.sys}','system_admin',null);
`;

async function setup() {
  const db = new PGlite();
  await db.exec(STANDIN);
  await db.exec(FOUNDATION);
  await db.exec(ANALYTICS);
  await db.exec(AUTOPILOT);
  await db.exec(`grant all on all tables in schema public to service_role;`);
  return db;
}
async function as<T>(db: PGlite, user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ""}', false);`);
  await db.exec(user === "service" ? "set role service_role" : user ? "set role authenticated" : "set role anon");
  try { return await fn(); } finally { await db.exec("reset role"); }
}
const configure = (db: PGlite, user: string, url: string) =>
  as(db, user, () => db.query(`select public.growth_seo_configure_site($1, true, 6::smallint, 12::smallint, 'fakta')`, [url]));
async function activeGsc(db: PGlite, company: string, gsc: string) {
  await as(db, "service", () => db.query(`insert into public.growth_analytics_connections (company_id, gsc_site_url, status) values ($1, $2, 'active')`, [company, gsc]));
}

Deno.test("seo.autopilot is an executable task type", async () => {
  const db = await setup();
  const r = await db.query<{ ok: boolean }>(`select public.growth_executable('seo-agent', 'seo.autopilot') as ok`);
  assertEquals(r.rows[0].ok, true);
});

Deno.test("configure: owner only, needs an active Search Console connection, and only that domain", async () => {
  const db = await setup();
  await assertRejects(() => configure(db, U.ownerA, "https://www.x.dk"), Error, "connect and verify Search Console first");
  await activeGsc(db, A, "sc-domain:x.dk");
  await assertRejects(() => configure(db, U.mgrA, "https://www.x.dk"), Error, "only owner or company_admin");
  await assertRejects(() => configure(db, U.ownerA, "https://www.someone-else.dk"), Error, "not covered");
  await assertRejects(() => configure(db, U.ownerA, "https://evilx.dk"), Error, "not covered");
  await assertRejects(() => configure(db, U.ownerA, "http://www.x.dk"), Error, "https://host");
  assertEquals((await configure(db, U.ownerA, "https://WWW.x.dk/")).rows[0], { growth_seo_configure_site: "enabled" });
  await configure(db, U.ownerA, "https://x.dk");
  const r = await as(db, U.ownerA, () => db.query<{ site_url: string }>(`select site_url from public.growth_seo_sites`));
  assertEquals(r.rows, [{ site_url: "https://x.dk" }]);
});

Deno.test("URL-prefix property covers only its own host", async () => {
  const db = await setup();
  await activeGsc(db, A, "https://www.x.dk/");
  await configure(db, U.ownerA, "https://www.x.dk");
  await assertRejects(() => configure(db, U.ownerA, "https://shop.x.dk"), Error, "not covered");
});

Deno.test("autopilot data is tenant-isolated and read-only for clients", async () => {
  const db = await setup();
  await as(db, "service", () => db.query(`insert into public.growth_seo_runs (id, company_id, kind, trigger, status) values ('00000000-0000-0000-0000-0000000000a1', $1, 'loop', 'schedule', 'ok'), ('00000000-0000-0000-0000-0000000000b1', $2, 'loop', 'schedule', 'ok')`, [A, B]));
  const seen = await as(db, U.ownerB, () => db.query<{ id: string }>(`select id from public.growth_seo_runs`));
  assertEquals(seen.rows.map((r) => r.id), ["00000000-0000-0000-0000-0000000000b1"]);
  await assertRejects(() => as(db, U.ownerA, () => db.query(`insert into public.growth_seo_runs (company_id, kind, trigger) values ($1, 'loop', 'manual')`, [A])), Error, "permission denied");
  await assertRejects(() => as(db, U.ownerA, () => db.query(`update public.growth_seo_drafts set decision = 'approved'`)), Error, "permission denied");
  await assertRejects(() => as(db, null, () => db.query(`select * from public.growth_seo_drafts`)), Error, "permission denied");
});

Deno.test("only owner/company_admin of the same company decides a draft, once", async () => {
  const db = await setup();
  const id = "00000000-0000-0000-0000-0000000000d1";
  await as(db, "service", () => db.query(`insert into public.growth_seo_drafts (id, company_id, kind, title, body, review_status) values ($1, $2, 'page', 'T', 'b', 'passed')`, [id, A]));
  const decide = (u: string, approve: boolean) => as(db, u, () => db.query(`select public.growth_seo_decide_draft($1, $2)`, [id, approve]));
  await assertRejects(() => decide(U.ownerB, true), Error, "draft not found");
  await assertRejects(() => decide(U.mgrA, true), Error, "only owner or company_admin");
  await decide(U.ownerA, true);
  await assertRejects(() => decide(U.ownerA, false), Error, "already approved");
  const r = await as(db, U.ownerA, () => db.query<{ decision: string; decided_by: string }>(`select decision, decided_by from public.growth_seo_drafts`));
  assertEquals(r.rows[0], { decision: "approved", decided_by: U.ownerA });
  const log = await as(db, "service", () => db.query<{ event: string }>(`select event from public.growth_audit_log where subject_id = $1`, [id]));
  assert(log.rows.some((x) => x.event === "seo_draft.approved"));
});
