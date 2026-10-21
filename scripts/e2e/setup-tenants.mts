/// <reference types="node" />
/**
 * Provisions the two E2E test tenants (A + B) on the DEDICATED test project.
 *
 * Refuses to run unless TEST_SUPABASE_* are set, E2E_ALLOW_TEST_PROJECT=1, and
 * the URL is not production. Writes a machine-readable summary to stdout.
 *
 *   TEST_SUPABASE_URL=... TEST_SUPABASE_ANON_KEY=... TEST_SUPABASE_SERVICE_ROLE_KEY=... \
 *   E2E_ALLOW_TEST_PROJECT=1 node scripts/e2e/setup-tenants.mts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createServiceClient, supabasePort } from "../../src/mastra/e2e/supabase-port.ts";
import { provisionTwoTenants, TEST_PASSWORD } from "../../src/mastra/e2e/provision.ts";
import { ProductionGuardError } from "../../src/mastra/e2e/testenv.ts";

async function main() {
  const modeA = process.env.E2E_MODE_A ?? "draft_approval";
  const modeB = process.env.E2E_MODE_B ?? "off";
  const port = supabasePort(createServiceClient());
  const { a, b } = await provisionTwoTenants(port, modeA, modeB);

  // Write a local, gitignored tenants file the Playwright specs consume.
  const outFile = process.env.E2E_TENANTS_FILE ?? "e2e/.tenants.local.json";
  const payload = { password: TEST_PASSWORD, baseURL: process.env.TEST_SUPABASE_URL, tenants: { a, b } };
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({ ok: true, wrote: outFile, tenants: { a, b } }, null, 2));
}

main().catch((err) => {
  if (err instanceof ProductionGuardError) {
    console.error(`[setup-tenants] BLOCKED: ${err.message}`);
    process.exit(2);
  }
  console.error("[setup-tenants] ERROR:", err?.message ?? err);
  process.exit(1);
});
