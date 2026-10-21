/// <reference types="node" />
/**
 * Applies supabase/migrations/*.sql to the TEST project via the Supabase
 * Management API SQL endpoint (token-based — no DB password needed).
 *
 * Hard guards: requires TEST_SUPABASE_PROJECT_REF, refuses if it equals the
 * production ref, and requires E2E_ALLOW_TEST_PROJECT=1.
 *
 *   bash scripts/e2e/with-env.sh node scripts/e2e/apply-migrations-mgmt.mts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.TEST_SUPABASE_PROJECT_REF;
const prodRef = process.env.PROD_SUPABASE_PROJECT_ID ?? process.env.VITE_SUPABASE_PROJECT_ID;

function die(msg: string, code = 2): never { console.error(`[migrate] BLOCKED: ${msg}`); process.exit(code); }

if (process.env.E2E_ALLOW_TEST_PROJECT !== "1") die("set E2E_ALLOW_TEST_PROJECT=1");
if (!token) die("SUPABASE_ACCESS_TOKEN missing");
if (!ref) die("TEST_SUPABASE_PROJECT_REF missing");
if (prodRef && ref === prodRef) die(`TEST ref equals PRODUCTION ref (${ref}) — refusing`);

const dir = join(process.cwd(), "supabase", "migrations");
const from = process.env.E2E_MIGRATE_FROM; // optional: resume at this filename (inclusive)
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().filter((f) => !from || f >= from);

/**
 * Test-only in-memory fixes for migration files that are invalid SQL as committed.
 * Empty now that 20260912000001's unescaped apostrophe is fixed at source
 * (`customer's` → `customer''s`). Kept as a hook for any future defect.
 */
const FIXES: Record<string, Array<[string, string]>> = {};
function patch(file: string, sql: string): string {
  let out = sql;
  for (const [a, b] of FIXES[file] ?? []) out = out.split(a).join(b);
  return out;
}
console.log(`[migrate] applying ${files.length} migrations to TEST ref ${ref.slice(0, 4)}***${from ? ` (resume from ${from})` : ""}`);

async function runSql(sql: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (res.ok) return { ok: true };
  let msg = `${res.status}`;
  try { const j = await res.json(); msg = j.message ?? JSON.stringify(j); } catch { /* */ }
  return { ok: false, error: msg };
}

let applied = 0;
for (const f of files) {
  const sql = patch(f, readFileSync(join(dir, f), "utf8"));
  const r = await runSql(sql);
  if (!r.ok) {
    // Idempotent re-runs: tolerate "already exists" so re-applying is safe.
    if (/already exists|already a member|duplicate/i.test(r.error ?? "")) {
      console.log(`  ~ ${f} (already applied)`);
      applied++;
      continue;
    }
    console.error(`  ✗ ${f}\n    ${r.error}`);
    die(`migration failed at ${f}`, 1);
  }
  applied++;
  if (applied % 10 === 0 || applied === files.length) console.log(`  ✓ ${applied}/${files.length}`);
}
console.log(`[migrate] done: ${applied}/${files.length} applied to TEST project`);
