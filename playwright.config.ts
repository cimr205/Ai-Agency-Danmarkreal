import { defineConfig, devices } from "@playwright/test";

/**
 * AI Agency Danmark — QA Autopilot (E2E).
 * Drives the REAL installed Google Chrome (channel: "chrome"), because
 * Playwright's bundled Chromium is unsupported on this macOS 13 host.
 * Three viewports: desktop 1440x900, tablet 768x1024, mobile 390x844.
 */
const BASE_URL = process.env.QA_BASE_URL || "http://localhost:8080";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "docs/qa/report", open: "never" }],
    ["json", { outputFile: "docs/qa/results.json" }],
  ],
  use: {
    baseURL: BASE_URL,
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 768, height: 1024 } } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
