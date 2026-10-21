/// <reference types="node" />
/**
 * Deletes ONLY E2E-marked resources (company-name marker + test email domain)
 * from the DEDICATED test project. Never touches untagged rows or production.
 *
 *   TEST_SUPABASE_URL=... TEST_SUPABASE_SERVICE_ROLE_KEY=... TEST_SUPABASE_ANON_KEY=... \
 *   E2E_ALLOW_TEST_PROJECT=1 node scripts/e2e/cleanup.mts
 */
import { createServiceClient, supabasePort } from "../../src/mastra/e2e/supabase-port.ts";
import { cleanupTestData } from "../../src/mastra/e2e/provision.ts";
import { ProductionGuardError } from "../../src/mastra/e2e/testenv.ts";

async function main() {
  const port = supabasePort(createServiceClient());
  const counts = await cleanupTestData(port);
  console.log(JSON.stringify({ ok: true, deleted: counts }, null, 2));
}

main().catch((err) => {
  if (err instanceof ProductionGuardError) {
    console.error(`[cleanup] BLOCKED: ${err.message}`);
    process.exit(2);
  }
  console.error("[cleanup] ERROR:", err?.message ?? err);
  process.exit(1);
});
