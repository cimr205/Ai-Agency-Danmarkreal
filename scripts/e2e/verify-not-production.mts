/// <reference types="node" />
/**
 * Preflight (QA-1 step 4): proves the configured TEST project is NOT production
 * by comparing host + project ref against the production identifiers. Prints
 * only booleans / redacted hosts — never keys. Exits non-zero if unsafe.
 *
 *   bash scripts/e2e/with-env.sh node scripts/e2e/verify-not-production.mts
 */
import { loadTestEnv, assertNonProduction, ProductionGuardError } from "../../src/mastra/e2e/testenv.ts";

function hostOf(u?: string): string | null {
  if (!u) return null;
  try { return new URL(u).host; } catch { return null; }
}
/** Redact a host/ref to its shape so logs don't leak the full project ref. */
function redact(s: string | null): string {
  if (!s) return "(unset)";
  return s.length <= 6 ? "***" : `${s.slice(0, 3)}***${s.slice(-3)}`;
}

try {
  const cfg = loadTestEnv(process.env);        // throws if missing / prod-match / no ack
  assertNonProduction(cfg.url, process.env);   // belt-and-braces

  const testHost = hostOf(cfg.url);
  const prodHost = hostOf(process.env.VITE_SUPABASE_URL ?? process.env.PROD_SUPABASE_URL);
  const testRef = process.env.TEST_SUPABASE_PROJECT_REF ?? null;
  const prodRef = process.env.VITE_SUPABASE_PROJECT_ID ?? process.env.PROD_SUPABASE_PROJECT_ID ?? null;

  const hostDistinct = !prodHost || testHost !== prodHost;
  const refDistinct = !prodRef || testRef !== prodRef;
  const prodKnown = Boolean(prodHost || prodRef);

  console.log(JSON.stringify({
    testHost: redact(testHost), prodHost: redact(prodHost),
    testRef: redact(testRef), prodRef: redact(prodRef),
    hostDistinctFromProd: hostDistinct,
    refDistinctFromProd: refDistinct,
    productionIdentifiersProvided: prodKnown,
    verdict: hostDistinct && refDistinct ? (prodKnown ? "PASS (distinct from production)" : "PASS (guard ok; prod identifiers not provided — set PROD_SUPABASE_URL/_PROJECT_ID for a full comparison)") : "FAIL",
  }, null, 2));

  if (!hostDistinct || !refDistinct) process.exit(1);
} catch (err) {
  if (err instanceof ProductionGuardError) { console.error(`BLOCKED: ${err.message}`); process.exit(2); }
  throw err;
}
