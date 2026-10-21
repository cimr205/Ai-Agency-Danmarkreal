import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the Mastra two-tenant authenticated E2E (QA-1).
 *
 * Runs ONLY against the dedicated test Supabase project + a local app build.
 * Requires (see e2e/README.md): TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY,
 * TEST_SUPABASE_SERVICE_ROLE_KEY, E2E_ALLOW_TEST_PROJECT=1, and the tenants file
 * produced by scripts/e2e/setup-tenants.mts. Never points at production.
 */
const APP_BASE_URL = process.env.E2E_APP_BASE_URL ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // tenant state is shared; keep ordering deterministic
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "e2e-results.json" }]],
  use: {
    baseURL: APP_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  // macOS 13 can't install Playwright's bundled Chromium, so the UI spec uses
  // the system Google Chrome via `channel: "chrome"`. Specs 01–06 are fetch-only
  // and don't launch a browser at all.
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
});
