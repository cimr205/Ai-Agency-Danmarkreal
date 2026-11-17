// Runs the real Growth OS migration in PGlite (Postgres 17 compiled to WASM) on
// top of a minimal stand-in for the Supabase pieces it depends on (auth.uid(),
// companies, profiles, user_roles, get_user_company_id), then checks tenant
// isolation, roles, idempotency, leasing, budgets, approvals and the audit log.
// Run: deno test --allow-read --allow-env supabase/functions/_shared/growth-os/sql_rls_test.ts
import { PGlite } from "npm:@electric-sql/pglite@0.3.14";
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ACTION_LEVELS } from "./approval.ts";

const MIGRATION = await Deno.readTextFile(new URL("../../../migrations/20261114120000_growth_os_foundation.sql", import.meta.url));

const C1 = "11111111-1111-1111-1111-111111111111";
const C2 = "22222222-2222-2222-2222-222222222222";
const U = { admin1: "a0000000-0000-0000-0000-000000000001", emp1: "a0000000-0000-0000-0000-000000000002", admin2: "b0000000-0000-0000-0000-000000000001", mgr1: "a0000000-0000-0000-0000-000000000003" };
const HASH = "a".repeat(64);
const HASH2 = "b".repeat(64);

const SUPABASE_STANDIN = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create type public.app_role as enum ('owner','company_admin','manager','employee','readonly','partner','system_admin');
create table public.companies (id uuid primary key, name text);
create table public.profiles (user_id uuid primary key, company_id uuid references public.companies(id));
create table public.user_roles (user_id uuid, role public.app_role, company_id uuid);
create function public.get_user_company_id(_user_id uuid) returns uuid language sql stable security definer set search_path to 'public'
  as $$ select company_id from public.profiles where user_id = _user_id $$;
insert into public.companies values ('${C1}','one'),('${C2}','two');
insert into public.profiles values ('${U.admin1}','${C1}'),('${U.emp1}','${C1}'),('${U.mgr1}','${C1}'),('${U.admin2}','${C2}');
insert into public.user_roles values ('${U.admin1}','company_admin','${C1}'),('${U.emp1}','employee','${C1}'),('${U.mgr1}','manager','${C1}'),('${U.admin2}','owner','${C2}');
`;

async function setup() {
  const db = new PGlite();
  await db.exec(SUPABASE_STANDIN);
  await db.exec(MIGRATION);
  await db.exec(`grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role;`);
  return db;
}

async function as(db: PGlite, user: string | null, fn: () => Promise<void>) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user ?? ""}', false);`);
  await db.exec(user ? "set role authenticated" : "set role service_role");
  try { await fn(); } finally { await db.exec("reset role"); }
}

const enqueue = (db: PGlite, key: string, agent = "seo-agent", type = "seo.onpage_audit") =>
  db.query<{ id: string }>(`select public.growth_enqueue_task($1, $2, '{"url":"https://example.dk/"}'::jsonb, 'audit', $3) as id`, [agent, type, key]);

Deno.test("SQL action levels mirror approval.ts", async () => {
  const db = await setup();
  for (const [action, level] of Object.entries(ACTION_LEVELS)) {
    const r = await db.query<{ l: number }>("select public.growth_action_level($1) as l", [action]);
    assertEquals(r.rows[0].l, level, action);
  }
  assertEquals((await db.query<{ l: number }>("select public.growth_action_level('made.up') as l")).rows[0].l, 3);
});

Deno.test("tenant isolation, roles and idempotency on enqueue", async () => {
  const db = await setup();
  let id1 = "";
  await as(db, U.admin1, async () => {
    id1 = (await enqueue(db, "key-00000001")).rows[0].id;
    const again = (await enqueue(db, "key-00000001")).rows[0].id;
    assertEquals(again, id1, "same idempotency key returns the same task");
    assertEquals((await db.query("select * from public.growth_tasks")).rows.length, 1);
    assertEquals((await db.query("select * from public.growth_activity_events")).rows.length, 1);
  });
  await as(db, U.admin2, async () => {
    assertEquals((await db.query("select * from public.growth_tasks")).rows.length, 0, "company 2 cannot read company 1 tasks");
    assertEquals((await db.query("select * from public.growth_activity_events")).rows.length, 0);
    assertEquals((await db.query("select * from public.growth_audit_log")).rows.length, 0);
    // same idempotency key in another company is a different task
    const other = (await enqueue(db, "key-00000001")).rows[0].id;
    assert(other !== id1);
    await assertRejects(() => db.query(`update public.growth_tasks set status = 'cancelled' where id = $1`, [id1]));
  });
  await as(db, U.emp1, async () => {
    assertEquals((await db.query("select * from public.growth_tasks")).rows.length, 1, "employees can read their company's tasks");
    await assertRejects(() => enqueue(db, "key-00000002"), Error, "only owner, company_admin or manager");
  });
  await as(db, U.mgr1, async () => {
    await assertRejects(() => enqueue(db, "key-00000003", "cro-agent", "cro.audit"), Error, "no executor");
    await assertRejects(() => db.query(`insert into public.growth_tasks (company_id, agent_id, type, idempotency_key, budget_usd) values ('${C1}','seo-agent','seo.onpage_audit','direct-insert',0.01)`));
    await assertRejects(() => db.query(`select * from public.growth_claim_task('w')`), Error, "permission denied");
    await assertRejects(() => db.query(`select public.growth_reserve_budget('${C1}', 0.01)`), Error, "permission denied");
  });
  await as(db, null, async () => {
    assertEquals((await db.query("select * from public.growth_tasks")).rows.length, 2, "service role (agent runtime) sees all");
  });
});

Deno.test("leases: one worker per task, expired leases reclaimable, lost lease cannot finish", async () => {
  const db = await setup();
  await as(db, U.admin1, async () => { await enqueue(db, "lease-0001"); });
  await as(db, null, async () => {
    const a = await db.query<{ id: string }>(`select id from public.growth_claim_task('worker-a', 60)`);
    const b = await db.query<{ id: string }>(`select id from public.growth_claim_task('worker-b', 60)`);
    assertEquals(a.rows.length, 1);
    assertEquals(b.rows.length, 0, "a leased task is not handed to a second worker");
    const id = a.rows[0].id;
    await db.query(`update public.growth_tasks set lease_expires_at = now() - interval '1 second' where id = $1`, [id]);
    const c = await db.query<{ id: string; attempts: number }>(`select id, attempts from public.growth_claim_task('worker-c', 60)`);
    assertEquals(c.rows[0].id, id);
    assertEquals(c.rows[0].attempts, 2);
    assertEquals((await db.query<{ ok: boolean }>(`select public.growth_finish_task($1, 'worker-a', 'completed', '{}'::jsonb) as ok`, [id])).rows[0].ok, false, "old worker lost the lease");
    assertEquals((await db.query<{ ok: boolean }>(`select public.growth_finish_task($1, 'worker-c', 'completed', '{"ok":1}'::jsonb) as ok`, [id])).rows[0].ok, true);
    assertEquals((await db.query<{ ok: boolean }>(`select public.growth_finish_task($1, 'worker-c', 'failed', '{}'::jsonb) as ok`, [id])).rows[0].ok, false, "a finished task is not finished twice");
    assertEquals((await db.query(`select * from public.growth_claim_task('worker-d', 60)`)).rows.length, 0);
  });
});

Deno.test("max attempts: a task that keeps losing its lease goes dead instead of looping", async () => {
  const db = await setup();
  await as(db, U.admin1, async () => { await enqueue(db, "dead-0001"); });
  await as(db, null, async () => {
    for (let i = 0; i < 3; i++) {
      const r = await db.query<{ id: string }>(`select id from public.growth_claim_task('w', 60)`);
      assertEquals(r.rows.length, 1);
      await db.query(`update public.growth_tasks set lease_expires_at = now() - interval '1 second'`);
    }
    assertEquals((await db.query(`select * from public.growth_claim_task('w', 60)`)).rows.length, 0);
    assertEquals((await db.query<{ status: string }>(`select status from public.growth_tasks`)).rows[0].status, "dead");
  });
});

Deno.test("budget: reservation is refused above the daily limit; settle replaces the reservation", async () => {
  const db = await setup();
  await as(db, null, async () => {
    const r = async (usd: number) => (await db.query<{ ok: boolean }>(`select public.growth_reserve_budget('${C1}', $1) as ok`, [usd])).rows[0].ok;
    assertEquals(await r(0.4), true);
    assertEquals(await r(0.2), false, "0.4 + 0.2 > 0.50 default limit");
    await db.query(`select public.growth_settle_budget('${C1}', 0.4, 0.01)`);
    assertEquals(await r(0.2), true);
    assertEquals(await r(0.5), false);
    assertEquals(await r(0.29), true, "company 1's spend is 0.21, 0.29 more fits");
    const c2 = (await db.query<{ ok: boolean }>(`select public.growth_reserve_budget('${C2}', 0.5) as ok`)).rows[0].ok;
    assertEquals(c2, true, "company 2 has its own budget");
  });
  await as(db, U.emp1, async () => {
    await assertRejects(() => db.query(`select public.growth_set_budget(0.2, 0.05)`), Error, "only owner or company_admin");
  });
  await as(db, U.admin1, async () => {
    await assertRejects(() => db.query(`select public.growth_set_budget(5, 0.05)`), Error, "out of range");
    await db.query(`select public.growth_set_budget(0.2, 0.05)`);
  });
});

Deno.test("approvals: humans of the same company only; rejected or altered payloads never execute", async () => {
  const db = await setup();
  let reqId = "", req2 = "";
  await as(db, null, async () => {
    const ins = (hash: string) => db.query<{ id: string }>(`insert into public.growth_approval_requests (company_id, agent_id, action, level, payload, payload_hash, summary)
      values ('${C1}', 'seo-agent', 'content.publish', 3, '{"page":"/"}', $1, 'Publish new title') returning id`, [hash]);
    reqId = (await ins(HASH)).rows[0].id;
    req2 = (await ins(HASH2)).rows[0].id;
    assertEquals((await db.query<{ id: string | null }>(`select public.growth_consume_approval('${C1}', 'content.publish', $1) as id`, [HASH])).rows[0].id, null, "pending is not approved");
  });
  await as(db, U.admin2, async () => {
    await assertRejects(() => db.query(`select public.growth_decide_approval($1, true)`, [reqId]), Error, "not found");
  });
  await as(db, U.emp1, async () => {
    await assertRejects(() => db.query(`select public.growth_decide_approval($1, true)`, [reqId]), Error, "only owner or company_admin");
    await assertRejects(() => db.query(`update public.growth_approval_requests set status = 'approved' where id = $1`, [reqId]));
  });
  await as(db, U.admin1, async () => {
    assertEquals((await db.query<{ r: string }>(`select public.growth_decide_approval($1, false, 'not now') as r`, [reqId])).rows[0].r, "rejected");
    await assertRejects(() => db.query(`select public.growth_decide_approval($1, true)`, [reqId]), Error, "request is rejected");
    assertEquals((await db.query<{ r: string }>(`select public.growth_decide_approval($1, true) as r`, [req2])).rows[0].r, "approved");
  });
  await as(db, null, async () => {
    const consume = async (hash: string) => (await db.query<{ id: string | null }>(`select public.growth_consume_approval('${C1}', 'content.publish', $1) as id`, [hash])).rows[0].id;
    assertEquals(await consume(HASH), null, "rejected payload never executes");
    assertEquals(await consume("c".repeat(64)), null, "an altered payload needs its own approval");
    assertEquals(await consume(HASH2), req2);
    assertEquals(await consume(HASH2), null, "an approval is used once");
    assertEquals((await db.query(`select * from public.growth_audit_log where event like 'approval.%'`)).rows.length, 2);
  });
  await as(db, null, async () => {
    await assertRejects(() => db.query(`update public.growth_audit_log set event = 'x'`), Error, "append-only");
    await assertRejects(() => db.query(`delete from public.growth_audit_log`), Error, "append-only");
  });
});
