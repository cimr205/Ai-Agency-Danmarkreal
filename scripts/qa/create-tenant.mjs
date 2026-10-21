#!/usr/bin/env node
/**
 * Create one isolated test tenant via the real signup flow, then (if a session
 * is granted) complete onboarding to create its company and save the browser
 * storageState for authenticated E2E. Run per tenant.
 *
 *   QA_EMAIL=... QA_PASSWORD=... QA_NAME=... QA_COMPANY=... QA_STATE=path node scripts/qa/create-tenant.mjs
 *
 * Probes email-confirmation: if the project requires it, no session is granted
 * and the script reports OUTCOME=email-confirmation-required (a hard blocker).
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const BASE = process.env.QA_BASE_URL || "http://localhost:8080";
const email = process.env.QA_EMAIL;
const password = process.env.QA_PASSWORD || "QaAutopilot!2026";
const fullName = process.env.QA_NAME || "QA Autopilot";
const company = process.env.QA_COMPANY || "QA Test Co";
const statePath = process.env.QA_STATE || "tests/e2e/.auth/state.json";

if (!email) { console.error("QA_EMAIL required"); process.exit(2); }

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext();
// Privacy-preserving consent (necessary only) so the cookie banner never
// intercepts clicks during automation.
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() }));
  } catch { /* ignore */ }
});
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

try {
  await page.goto(`${BASE}/en/auth/signup`, { waitUntil: "networkidle" });
  await page.locator("form input").first().fill(fullName);
  await page.locator('input[type="email"]').fill(email);
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill(password);
  await pw.nth(1).fill(password);
  const vals = await page.locator("form input").evaluateAll((els) => els.map((e) => `${e.type}:${(e.value || "").length}`));
  console.log("FIELD_VALUES=" + JSON.stringify(vals));
  const btn = page.locator('form button[type="submit"]');
  console.log("BTN_DISABLED=" + (await btn.isDisabled()));
  await btn.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "tests/e2e/.auth/signup-debug.png" }).catch(() => {});

  let outcome = "unknown";
  try {
    await page.waitForURL(/\/app(\/|$)|\/onboarding/, { timeout: 15_000 });
    outcome = "session";
  } catch {
    const body = (await page.locator("body").innerText()).toLowerCase();
    if (/check your email|confirm your email|verify|bekræft|bestätige/.test(body)) outcome = "email-confirmation-required";
    else outcome = "no-redirect";
  }

  console.log("LANDING_URL=" + page.url());
  console.log("OUTCOME=" + outcome);
  console.log("PAGE_ERRORS=" + pageErrors.length);
  const toast = await page.locator('[data-sonner-toast], [role="status"], [role="alert"]').allInnerTexts().catch(() => []);
  const validation = await page.locator(".text-destructive").allInnerTexts().catch(() => []);
  console.log("TOAST=" + JSON.stringify(toast));
  console.log("VALIDATION=" + JSON.stringify(validation));

  if (outcome === "session") {
    // If routed to onboarding, create the company so the tenant is usable.
    if (/\/onboarding/.test(page.url())) {
      try {
        const nameField = page.getByPlaceholder(/company|virksomhed|firmanavn|name/i).first();
        await nameField.fill(company, { timeout: 5000 });
        await page.getByRole("button", { name: /create|continue|next|opret|fortsæt|gem|save|finish/i }).first().click();
        await page.waitForURL(/\/app(\/|$)/, { timeout: 15_000 }).catch(() => {});
        console.log("ONBOARDING_DONE_URL=" + page.url());
      } catch (e) {
        console.log("ONBOARDING_NOTE=" + String(e).split("\n")[0]);
      }
    }
    mkdirSync(dirname(statePath), { recursive: true });
    await ctx.storageState({ path: statePath });
    console.log("SAVED_STATE=" + statePath);
  }
} finally {
  await browser.close();
}
