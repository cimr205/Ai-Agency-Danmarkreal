// Dry-run on a real database inside ONE transaction that is always rolled back: applies a migration, switches
// to origin_app and runs every workflow query exactly as n8n sends it (values inlined, multi-statement).
// Usage: DBURL=... node security-dryrun.mjs ../sql/004_tenant_security.sql ../workflows/tenant-scoped-queries.json

import pg from 'pg'; import fs from 'fs';
const [migFile, qFile] = process.argv.slice(2);
const mig = fs.readFileSync(migFile, 'utf8').replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '');
const Q = JSON.parse(fs.readFileSync(qFile, 'utf8'));
const c = new pg.Client({ connectionString: process.env.DBURL, ssl: { rejectUnauthorized: false } });
await c.connect();
// format like pg-promise: values are inlined client-side, so a multi-statement string runs in one round trip
const lit = (v) => v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : c.escapeLiteral(String(v));
const fmt = (sql, vals) => sql.replace(/\$(\d+)/g, (_, i) => lit(vals[+i - 1]));
const run = async (sql, vals = []) => { const r = await c.query(fmt(sql, vals)); const all = Array.isArray(r) ? r : [r]; return all.flatMap((x) => x.rows); };
let n = 0, ok = 0, fail = 0;
const check = (cond, msg) => { cond ? ok++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + msg); };
const expectErr = async (sql, vals, msg) => { n++; await c.query(`SAVEPOINT s${n}`); try { await run(sql, vals); check(false, msg + ' (no error)'); } catch (e) { check(true, `${msg} -> ${e.message.slice(0, 70)}`); } await c.query(`ROLLBACK TO SAVEPOINT s${n}`); };
const D = Q.D, B = Q.BCE;
await c.query("BEGIN; SET LOCAL lock_timeout='3s'; SET LOCAL statement_timeout='30s'");
try {
  await c.query(mig);
  check(true, 'migration 004 applies on the production schema');
  await c.query('SET LOCAL ROLE origin_app');
  check((await run('select current_user u'))[0].u === 'origin_app', 'running as origin_app');
  check((await run('select count(*)::int n from jobs'))[0].n === 0, 'no tenant set -> sees 0 jobs');
  await expectErr('select * from tenants', [], 'direct read of tenants denied');
  check((await run("select pg_has_role('origin_app','origin_scheduler','MEMBER') m"))[0].m === false && (await run("select has_function_privilege('origin_scheduler','origin_find_recoverable_jobs(int)','EXECUTE') o, (select proacl::text from pg_proc where proname='origin_find_recoverable_jobs') acl"))[0].acl.includes('origin_app=X') , 'origin_app is not a member of origin_scheduler; EXECUTE granted explicitly, not to PUBLIC');
  const tenants = (await run(B['List tenants'].query)).map((r) => r.id);
  check(tenants.join() === 'tenant_demo,tenant_test', `List tenants via function: ${tenants}`);
  const mt = await run(D['Manual test input'].query);
  check(mt.length === 1 && mt[0].tenant_id === 'tenant_test', 'Manual test input via function picks tenant_test');
  await expectErr('SELECT * FROM origin_find_recoverable_jobs(0)', [], 'find_recoverable rejects p_limit 0');

  // full D lifecycle for tenant_test, using the exact workflow strings
  const key = 'tenant_test:recovery:sectest:once:v1:http500';
  const cr = await run(D['Create job (idempotent)'].query, ['tenant_test', key, '{"scenario":"http500"}']);
  check(cr.length === 1 && cr[0].id, 'Create job returns only the job row (prefix adds no row)');
  const cl = await run(D['Claim job'].query, ['w-sec', 'tenant_test', key]);
  check(cl.length === 1 && cl[0].attempt_count === 1, 'Claim job under RLS');
  const id = cl[0].id;
  await run(D['Log attempt 1 failed'].query, [id, 'tenant_test', 1, 'w-sec', 'e1']);
  check((await run(D['Renew lease before attempt 2'].query, [id, 'tenant_test', 'w-sec'])).length === 1, 'Renew lease 2');
  await run(D['Log attempt 2 failed'].query, [id, 'tenant_test', 2, 'w-sec', 'e2']);
  check((await run(D['Renew lease before attempt 3'].query, [id, 'tenant_test', 'w-sec'])).length === 1, 'Renew lease 3');
  check((await run(D['Dead-letter job'].query, [id, 'tenant_test', 3, 'w-sec', 'e3', key])).length === 1, 'Dead-letter + notification under RLS');

  // tenant A can never touch tenant B
  const k2 = 'tenant_test:recovery:sectest2:once:v1:ok';
  const id2 = (await run(D['Create job (idempotent)'].query, ['tenant_test', k2, '{"scenario":"ok"}']))[0].id;
  check((await run(D['Claim job'].query, ['w-evil', 'tenant_demo', k2])).length === 0, 'tenant_demo cannot claim tenant_test job');
  check((await run(D['Record completed job'].query, [id2, 'tenant_demo', 1, 'w-evil', '{}'])).length === 0, 'tenant_demo cannot complete tenant_test job by id');
  check((await run("SELECT 1 WHERE set_config('app.tenant_id', $1, true) IS NULL; UPDATE jobs SET status='dead' WHERE tenant_id = 'tenant_test' RETURNING id", ['tenant_demo'])).length === 0, 'tenant_demo context: UPDATE of tenant_test rows affects 0 rows');
  check((await run("SELECT 1 WHERE set_config('app.tenant_id', $1, true) IS NULL; SELECT count(*)::int n FROM jobs WHERE tenant_id <> $1", ['tenant_demo']))[0].n === 0, 'tenant_demo context: reads 0 rows of other tenants');
  await expectErr("SELECT 1 WHERE set_config('app.tenant_id', $1, true) IS NULL; INSERT INTO observations (tenant_id, external_id, dedupe_key, source, title, fetched_at) VALUES ('tenant_test','x','tenant_test:x','sec','t',now())", ['tenant_demo'], 'tenant_demo context: cannot insert tenant_test observation');
  await expectErr(B['Log tenant failure'].query.replace("$1, $2", "'tenant_test', $2"), ['tenant_demo', 'AAD B/C/E', 'k', 'm'], 'automation_errors: cannot write other tenant');
  check((await run("SELECT 1 WHERE set_config('app.tenant_id', $1, true) IS NULL; SELECT count(*)::int n FROM automation_errors WHERE tenant_id <> $1", ['tenant_demo']))[0].n === 0, 'automation_errors: other tenant rows invisible');
  check((await run("SELECT 1 WHERE set_config('app.tenant_id', $1, true) IS NULL; SELECT count(*)::int n FROM notifications WHERE tenant_id <> $1", ['tenant_demo']))[0].n === 0, 'notifications: other tenant rows invisible');

  // B/C/E writes under RLS for the right tenant
  const obs = await run(B['Store new observations'].query, ['tenant_demo', 'sec-1', 'tenant_demo:sec:1', 'sec', 'title', 'body', new Date().toISOString()]);
  check(obs.length === 1 && obs[0].tenant_id === 'tenant_demo', 'Store new observations under RLS');
  const aj = await run(B['Store analysis job'].query, ['tenant_demo', 'tenant_demo:analysis:sec', '{"n":1}']);
  check(aj.length === 1, 'Store analysis job under RLS');
  check((await run(B['Create internal notification'].query, ['tenant_demo', aj[0].id, 'sec review'])).length === 1, 'Create internal notification under RLS');
  check((await run(B['Log tenant failure'].query, ['tenant_demo', 'AAD B/C/E', 'sec-item', 'sec msg'])).length === 1, 'Log tenant failure under RLS');

  // scheduler function: dead-letters exhausted, returns only recovery jobs, ids only
  await run("SELECT 1 WHERE set_config('app.tenant_id', $1, true) IS NULL; UPDATE jobs SET status='running', lease_owner='w-crash', lease_expires_at=now()-interval '1 minute', attempt_count=1 WHERE id=$2", ['tenant_test', id2]);
  const rec = await run(D['Find recoverable jobs'].query);
  check(rec.some((r) => r.job_key === k2) && Object.keys(rec[0] || {}).join() === 'tenant_id,job_key', 'find_recoverable returns crashed job, only tenant_id + job_key');
  const loaded = await run(D['Load recovery job'].query, ['tenant_test', k2]);
  check(loaded.length === 1 && loaded[0].payload.scenario === 'ok' && loaded[0].recovery === true, 'Load recovery job (tenant-scoped) returns payload');
  check((await run(D['Load recovery job'].query, ['tenant_demo', k2])).length === 0, 'Load recovery job for wrong tenant returns nothing');
} catch (e) { check(false, 'unexpected error: ' + e.message); }
await c.query('ROLLBACK');
const left = await c.query(`select (select count(*) from pg_roles where rolname='origin_scheduler')::int roles, (select count(*) from jobs where job_key like '%sectest%')::int jobs, (select count(*) from pg_proc where proname like 'origin_%')::int funcs`);
console.log('after ROLLBACK, leftovers in prod:', left.rows[0]);
console.log(`\n${ok} passed, ${fail} failed`);
await c.end(); process.exit(fail ? 1 : 0);
