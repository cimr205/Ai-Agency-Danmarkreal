// PGlite test of 20261117130000_growth_os_analytics.sql on top of the Growth OS
// foundation migration and a stand-in for the Supabase pieces they use.
// Run: deno test --node-modules-dir=none --allow-read --allow-env supabase/functions/_shared/growth-os/analytics_sql_test.ts
import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const FOUNDATION = await read("../../../migrations/20261114120000_growth_os_foundation.sql");
const ANALYTICS = await read("../../../migrations/20261117130000_growth_os_analytics.sql");

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
  await db.exec(`grant all on all tables in schema public to service_role;`);
  return db;
}
async function as<T>(db: PGlite, user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ""}', false);`);
  await db.exec(user === "service" ? "set role service_role" : user ? "set role authenticated" : "set role anon");
  try { return await fn(); } finally { await db.exec("reset role"); }
}
const request = (db: PGlite, user: string, ga4: string | null, gsc: string | null) =>
  as(db, user, () => db.query(`select public.growth_request_analytics_connection($1, $2)`, [ga4, gsc]));

Deno.test("only owner/company_admin can request a connection, and it starts pending", async () => {
  const db = await setup();
  await assertRejects(() => request(db, U.mgrA, "533214056", null), Error, "only owner or company_admin");
  await assertRejects(() => request(db, U.empA, "533214056", null), Error, "only owner or company_admin");
  await assertRejects(() => request(db, U.ownerA, "G-6L5R8WZTQ6", null), Error, "digits only");
  await assertRejects(() => request(db, U.ownerA, null, "aiagencydanmark.dk"), Error, "sc-domain");
  await request(db, U.ownerA, "533214056", "sc-domain:aiagencydanmark.dk");
  const r = await as(db, U.ownerA, () => db.query<{ status: string }>(`select status from public.growth_analytics_connections`));
  assertEquals(r.rows, [{ status: "pending" }]);
});

Deno.test("another company cannot claim a property already connected elsewhere", async () => {
  const db = await setup();
  await request(db, U.ownerA, "533214056", null);
  await assertRejects(() => request(db, U.ownerB, "533214056", null), Error, "already connected to another workspace");
});

Deno.test("only a system_admin can activate; company owners cannot activate themselves", async () => {
  const db = await setup();
  await request(db, U.ownerA, "533214056", null);
  await assertRejects(() => as(db, U.ownerA, () => db.query(`select public.growth_set_analytics_connection_status($1, 'active')`, [A])), Error, "only a system admin");
  await as(db, U.sys, () => db.query(`select public.growth_set_analytics_connection_status($1, 'active')`, [A]));
  const r = await as(db, U.ownerA, () => db.query<{ status: string }>(`select status from public.growth_analytics_connections`));
  assertEquals(r.rows[0].status, "active");
  // re-requesting (e.g. a new property) drops back to pending
  await request(db, U.ownerA, "999999999", null);
  assertEquals((await as(db, U.ownerA, () => db.query<{ status: string }>(`select status from public.growth_analytics_connections`))).rows[0].status, "pending");
});

Deno.test("analytics data is tenant-isolated and read-only for clients", async () => {
  const db = await setup();
  await as(db, "service", () => db.query(`insert into public.growth_gsc_daily values ($1,'2026-11-10',5,50,0.1,3, now()),($2,'2026-11-10',9,90,0.1,2, now())`, [A, B]));
  const seen = await as(db, U.empA, () => db.query<{ clicks: number }>(`select clicks from public.growth_gsc_daily`));
  assertEquals(seen.rows, [{ clicks: 5 }]);
  await assertRejects(() => as(db, U.ownerA, () => db.query(`insert into public.growth_gsc_daily values ($1,'2026-11-11',1,1,1,1, now())`, [A])), Error, "permission denied");
  await assertRejects(() => as(db, null, () => db.query(`select * from public.growth_gsc_daily`)), Error, "permission denied");
  // re-sync of the same day replaces, never adds
  await as(db, "service", () => db.query(`insert into public.growth_gsc_daily values ($1,'2026-11-10',7,70,0.1,3, now()) on conflict (company_id, day) do update set clicks = excluded.clicks`, [A]));
  assertEquals((await as(db, U.ownerA, () => db.query<{ n: number; c: number }>(`select count(*)::int n, sum(clicks)::int c from public.growth_gsc_daily`))).rows[0], { n: 1, c: 7 });
});

Deno.test("recommendations: approve by owner, implement by manager, nothing cross-tenant", async () => {
  const db = await setup();
  const rec = (await as(db, "service", () => db.query<{ id: string }>(`insert into public.growth_seo_recommendations (company_id, fingerprint, kind, target, problem, evidence, action, priority, expected_effect)
    values ($1,'ctr_gap|q|p','ctr_gap','https://x.dk/p','p','{}','a',1,'Estimate') returning id`, [A]))).rows[0].id;
  await assertRejects(() => as(db, U.mgrA, () => db.query(`select public.growth_decide_recommendation($1, true)`, [rec])), Error, "only owner or company_admin");
  await assertRejects(() => as(db, U.ownerB, () => db.query(`select public.growth_decide_recommendation($1, true)`, [rec])), Error, "not found");
  await assertRejects(() => as(db, U.mgrA, () => db.query(`select public.growth_mark_recommendation_implemented($1, current_date)`, [rec])), Error, "only approved");
  await as(db, U.ownerA, () => db.query(`select public.growth_decide_recommendation($1, true)`, [rec]));
  await assertRejects(() => as(db, U.empA, () => db.query(`select public.growth_mark_recommendation_implemented($1, current_date)`, [rec])), Error, "only owner, company_admin or manager");
  await assertRejects(() => as(db, U.mgrA, () => db.query(`select public.growth_mark_recommendation_implemented($1, current_date + 1)`, [rec])), Error, "between the proposal and today");
  await as(db, U.mgrA, () => db.query(`select public.growth_mark_recommendation_implemented($1, current_date)`, [rec]));
  // one open recommendation per fingerprint
  await assertRejects(() => as(db, "service", () => db.query(`insert into public.growth_seo_recommendations (company_id, fingerprint, kind, target, problem, evidence, action, priority, expected_effect) values ($1,'ctr_gap|q|p','ctr_gap','t','p','{}','a',1,'e')`, [A])), Error, "duplicate key");
});

Deno.test("business impact counts only tracked organic leads and says how many lack a source", async () => {
  const db = await setup();
  await db.exec(`
    insert into public.customers (id, company_id, record_type, status, acquisition_source) values
      ('d0000000-0000-0000-0000-000000000001','${A}','lead','customer','organic_search'),
      ('d0000000-0000-0000-0000-000000000002','${A}','lead','new','organic_search'),
      ('d0000000-0000-0000-0000-000000000003','${A}','lead','new',null),
      ('d0000000-0000-0000-0000-000000000004','${A}','lead','new','meta_ads'),
      ('d0000000-0000-0000-0000-000000000005','${B}','lead','customer','organic_search');
    insert into public.invoices (company_id, customer_id, amount, status, paid_at) values
      ('${A}','d0000000-0000-0000-0000-000000000001',1000,'paid',now()),
      ('${A}','d0000000-0000-0000-0000-000000000004',500,'paid',now()),
      ('${A}','d0000000-0000-0000-0000-000000000002',700,'sent',null),
      ('${B}','d0000000-0000-0000-0000-000000000005',9999,'paid',now());`);
  const r = await as(db, U.empA, () => db.query<{ j: Record<string, number> }>(`select public.growth_business_impact(current_date - 30, current_date) as j`));
  assertEquals(r.rows[0].j, { leads_total: 4, leads_without_source: 1, leads_organic: 2, leads_organic_converted: 1, paying_customers_total: 2, paying_customers_organic: 1, revenue_organic: 1000 });
  await assertRejects(() => as(db, null, () => db.query(`select public.growth_business_impact(current_date - 30, current_date)`)), Error, "permission denied");
});

Deno.test("role helpers answer only about the caller and are not anon-callable", async () => {
  const db = await setup();
  assertEquals((await as(db, U.empA, () => db.query<{ ok: boolean }>(`select public.growth_can_approve($1) ok`, [U.ownerA]))).rows[0].ok, false);
  assertEquals((await as(db, U.ownerA, () => db.query<{ ok: boolean }>(`select public.growth_can_approve($1) ok`, [U.ownerA]))).rows[0].ok, true);
  await assertRejects(() => as(db, null, () => db.query(`select public.growth_can_operate($1)`, [U.mgrA])), Error, "permission denied");
  // seo.opportunities is enqueueable by a manager
  const id = await as(db, U.mgrA, () => db.query<{ id: string }>(`select public.growth_enqueue_task('seo-agent','seo.opportunities','{}'::jsonb,'find opportunities','opps-key-0001') id`));
  assert(id.rows[0].id);
});
