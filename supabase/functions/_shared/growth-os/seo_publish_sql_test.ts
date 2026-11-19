// PGlite test of 20261119120000_growth_os_seo_auto_publish.sql (on top of the
// foundation, analytics and SEO autopilot migrations).
// Run: deno test --node-modules-dir=none --allow-read --allow-env supabase/functions/_shared/growth-os/seo_publish_sql_test.ts
import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";

const read = (p: string) => Deno.readTextFile(new URL(p, import.meta.url));
const MIGRATIONS = await Promise.all([
  "20261114120000_growth_os_foundation.sql", "20261117130000_growth_os_analytics.sql",
  "20261118120000_growth_os_seo_autopilot.sql", "20261119120000_growth_os_seo_auto_publish.sql",
].map((f) => read(`../../../migrations/${f}`)));

const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";
const U = { ownerA: "a0000000-0000-0000-0000-000000000001", mgrA: "a0000000-0000-0000-0000-000000000002", ownerB: "b0000000-0000-0000-0000-000000000001" };

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
insert into public.profiles values ('${U.ownerA}','${A}'),('${U.mgrA}','${A}'),('${U.ownerB}','${B}');
insert into public.user_roles values ('${U.ownerA}','owner','${A}'),('${U.mgrA}','manager','${A}'),('${U.ownerB}','owner','${B}');
`;

async function setup() {
  const db = new PGlite();
  await db.exec(STANDIN);
  for (const m of MIGRATIONS) await db.exec(m);
  await db.exec(`grant all on all tables in schema public to service_role;
    insert into public.growth_seo_sites (company_id, site_url) values ('${A}', 'https://www.x.dk');
    insert into public.growth_seo_drafts (id, company_id, kind, slug, title, body, review_status) values
      ('d0000000-0000-0000-0000-000000000001', '${A}', 'page', '/crm/a', 'A', 'tekst', 'passed'),
      ('d0000000-0000-0000-0000-000000000002', '${A}', 'page', '/crm/a', 'A2', 'tekst', 'passed'),
      ('d0000000-0000-0000-0000-000000000003', '${A}', 'audit', null, 'Audit', 'tekst', 'passed');`);
  return db;
}
async function as<T>(db: PGlite, user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ""}', false);`);
  await db.exec(user ? "set role authenticated" : "set role anon");
  try { return await fn(); } finally { await db.exec("reset role"); }
}
const D1 = "d0000000-0000-0000-0000-000000000001", D2 = "d0000000-0000-0000-0000-000000000002", D3 = "d0000000-0000-0000-0000-000000000003";
const one = async <T>(db: PGlite, user: string | null, sql: string, p: unknown[] = []) => (await as(db, user, () => db.query<T>(sql, p))).rows[0];

Deno.test("auto-publish switch: owner/admin only, bounded, audited, since-time kept while on", async () => {
  const db = await setup();
  await assertRejects(() => as(db, U.mgrA, () => db.query(`select public.growth_seo_set_auto_publish(true)`)), Error, "only owner");
  await assertRejects(() => as(db, U.ownerA, () => db.query(`select public.growth_seo_set_auto_publish(true, 5::smallint)`)), Error, "6–10");
  await assertRejects(() => as(db, U.ownerB, () => db.query(`select public.growth_seo_set_auto_publish(true)`)), Error, "configure");
  await as(db, U.ownerA, () => db.query(`select public.growth_seo_set_auto_publish(true, 8::smallint, 2::smallint)`));
  const s1 = (await db.query<{ auto_publish: boolean; since: string }>(`select auto_publish, auto_publish_since::text as since from public.growth_seo_sites`)).rows[0];
  await as(db, U.ownerA, () => db.query(`select public.growth_seo_set_auto_publish(true, 9::smallint, 2::smallint)`));
  const s2 = await db.query<{ since: string; min: number }>(`select auto_publish_since::text as since, publish_min_score as min from public.growth_seo_sites`);
  assertEquals([s1.auto_publish, s2.rows[0].since, s2.rows[0].min], [true, s1.since, 9]);
  const ev = await db.query<{ event: string }>(`select event from public.growth_audit_log where event like 'seo_autopilot.auto_publish%'`);
  assertEquals(ev.rows.length, 2);
});

Deno.test("human approval publishes an article once per path; audits are not articles", async () => {
  const db = await setup();
  assertEquals(await one(db, U.ownerA, `select public.growth_seo_decide_draft($1, true) as r`, [D1]), { r: "published" });
  assertEquals(await one(db, U.ownerA, `select public.growth_seo_decide_draft($1, true) as r`, [D2]), { r: "approved" }); // same path already live
  assertEquals(await one(db, U.ownerA, `select public.growth_seo_decide_draft($1, true) as r`, [D3]), { r: "approved" });
  const pub = await as(db, null, () => db.query<{ path: string; title: string }>(`select path, title from public.growth_seo_published_articles($1)`, [A]));
  assertEquals(pub.rows, [{ path: "/crm/a", title: "A" }]);
  assertEquals((await as(db, null, () => db.query(`select * from public.growth_seo_published_articles($1)`, [B]))).rows.length, 0);
});

Deno.test("unpublish: owner only, takes the article off the public list", async () => {
  const db = await setup();
  await as(db, U.ownerA, () => db.query(`select public.growth_seo_decide_draft($1, true)`, [D1]));
  await assertRejects(() => as(db, U.mgrA, () => db.query(`select public.growth_seo_unpublish($1)`, [D1])), Error, "only owner");
  await assertRejects(() => as(db, U.ownerB, () => db.query(`select public.growth_seo_unpublish($1)`, [D1])), Error, "not found");
  assertEquals(await one(db, U.ownerA, `select public.growth_seo_unpublish($1, 'forkert') as r`, [D1]), { r: "unpublished" });
  await assertRejects(() => as(db, U.ownerA, () => db.query(`select public.growth_seo_unpublish($1)`, [D1])), Error, "not live");
  assertEquals((await as(db, null, () => db.query(`select * from public.growth_seo_published_articles($1)`, [A]))).rows.length, 0);
});

Deno.test("anon can read published articles but nothing else", async () => {
  const db = await setup();
  await assertRejects(() => as(db, null, () => db.query(`select * from public.growth_seo_drafts`)), Error, "permission denied");
  await assertRejects(() => as(db, null, () => db.query(`select public.growth_seo_unpublish($1)`, [D1])), Error, "permission denied");
});
