#!/usr/bin/env node
// Static CI invariant for a real bug found and fixed in this repo: Postgres
// grants EXECUTE on every new function directly to `anon` and
// `authenticated` via this project's baseline_default_grants migration
// (`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO
// anon, authenticated, service_role`). A `revoke ... from public` in the
// same migration that CREATEs a function does NOT strip those direct
// per-role grants — only an explicit `revoke ... from anon, authenticated`
// does. ingest_meta_lead and register_invoice_payment_service shipped
// without that explicit revoke and were callable by any authenticated
// user, or no session at all, until this was caught by hand via
// information_schema.routine_privileges.
//
// This script re-derives the same check statically, from the migration
// SQL files themselves, with no database connection — so it runs in CI
// (which has no Supabase credentials configured) and fails the build
// before a regression is ever applied to the database.
//
// It is intentionally conservative: it only knows about the specific
// functions listed below. Adding a new service-only or user-scoped RPC
// means adding it to one of these lists.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'supabase', 'migrations');

// Functions that must NEVER be callable by anon or authenticated — they
// trust a caller-supplied company_id/tenant identifier with no internal
// auth.uid() check, so they are safe ONLY behind the service_role key
// (webhooks, background ingestion).
const SERVICE_ONLY_FUNCTIONS = [
  'ingest_meta_lead',
  'register_invoice_payment_service',
  'resolve_invoice_payment_reference',
];

// Functions that must be callable by authenticated but NOT anon — they
// resolve the caller's company from auth.uid() internally, so they're
// safe for signed-in users, but anon should never have had access at all
// (defense-in-depth: not exploitable today since each of these also
// explicitly checks `auth.uid() is null`, but there's no reason to leave
// the grant in place).
const AUTHENTICATED_NOT_ANON_FUNCTIONS = [
  'update_deal_stage',
  'update_lead_status',
  'update_task_status',
  'create_invoice_payment_reference',
  'instantiate_workflow_template',
];

function readAllMigrations() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  return files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8')).join('\n');
}

function hasExplicitRevoke(sql, fnName, role) {
  // Matches e.g. `revoke execute on function public.ingest_meta_lead(...) from anon, authenticated;`
  // or a role-specific line `... from anon;`. Deliberately loose on the
  // argument-type list between the function name and the closing paren —
  // this is a text-level invariant, not a real SQL parser — and requires
  // the function name to be followed by `(`  so a substring match against
  // a differently-named function can't false-positive.
  const pattern = new RegExp(
    `revoke\\s+(all|execute)[\\s\\S]{0,50}?\\bfunction\\s+public\\.${fnName}\\s*\\([\\s\\S]{0,400}?\\)[\\s\\S]{0,100}?from\\s+[\\s\\S]{0,100}?\\b${role}\\b`,
    'i',
  );
  return pattern.test(sql);
}

function main() {
  const sql = readAllMigrations();
  const failures = [];

  for (const fn of SERVICE_ONLY_FUNCTIONS) {
    if (!hasExplicitRevoke(sql, fn, 'anon') || !hasExplicitRevoke(sql, fn, 'authenticated')) {
      failures.push(
        `${fn}: must have an explicit "revoke execute on function public.${fn}(...) from anon, authenticated" ` +
        `somewhere in supabase/migrations/*.sql — "revoke ... from public" alone does NOT strip the direct ` +
        `per-role grants this project's default privileges create.`,
      );
    }
  }

  for (const fn of AUTHENTICATED_NOT_ANON_FUNCTIONS) {
    if (!hasExplicitRevoke(sql, fn, 'anon')) {
      failures.push(
        `${fn}: must have an explicit "revoke execute on function public.${fn}(...) from anon" ` +
        `somewhere in supabase/migrations/*.sql.`,
      );
    }
  }

  if (failures.length > 0) {
    console.error('check-service-only-grants: FAILED\n');
    for (const f of failures) console.error(`  - ${f}`);
    console.error(
      '\nIf this is a new function, add it to SERVICE_ONLY_FUNCTIONS or ' +
      'AUTHENTICATED_NOT_ANON_FUNCTIONS in scripts/check-service-only-grants.mjs ' +
      'AND add the matching revoke statement to its migration.',
    );
    process.exit(1);
  }

  console.log(`check-service-only-grants: OK (${SERVICE_ONLY_FUNCTIONS.length + AUTHENTICATED_NOT_ANON_FUNCTIONS.length} functions checked)`);
}

main();
