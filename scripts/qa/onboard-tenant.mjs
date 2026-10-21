#!/usr/bin/env node
/**
 * Complete the 3-step onboarding wizard for an already-signed-up tenant,
 * creating its company WITHOUT triggering a real payment: the wizard inserts
 * the company row before redirecting to Stripe checkout, so we block the
 * create-checkout call — the company is created, no checkout session is made.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE_URL || "http://localhost:8080";
const state = process.env.QA_STATE;
const company = process.env.QA_COMPANY || "QA Test Co";
const fullName = process.env.QA_NAME || "QA Admin";
if (!state) { console.error("QA_STATE required"); process.exit(2); }

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ storageState: state });
await ctx.addInitScript(() => {
  try { localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() })); } catch { /* ignore */ }
});
const page = await ctx.newPage();
// Block Stripe checkout — no real payment / checkout session is created.
await page.route(/create-checkout/, (route) => route.abort());

try {
  await page.goto(`${BASE}/en/app/onboarding`, { waitUntil: "networkidle" });

  // Step 1 — company details
  await page.locator("#full-name").fill(fullName);
  await page.locator("#company-name").fill(company);
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: /owner/i }).click();
  await page.locator(".max-w-lg button.flex-1").click();

  // Step 2 — team size
  await page.locator("#team-size").fill("5");
  await page.locator(".max-w-lg button.flex-1").click();

  // Step 3 — billing mode: full suite (no per-module seats needed), then submit
  await page.locator("#mode-full").click();
  await page.locator(".max-w-lg button.flex-1").click();

  // Company INSERT + bootstrap RPCs + refreshProfile run before the blocked
  // checkout; give them time to settle.
  await page.waitForTimeout(5000);

  // Verify the tenant is now usable (dashboard, not bounced to onboarding).
  await page.goto(`${BASE}/en/app/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  console.log("FINAL_URL=" + page.url());
  const onboarded = !/\/onboarding/.test(page.url());
  console.log("ONBOARDED=" + onboarded);
  if (onboarded) {
    await ctx.storageState({ path: state });
    console.log("STATE_RESAVED=" + state);
  } else {
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 200);
    console.log("STILL_ONBOARDING_BODY=" + body);
  }
} catch (e) {
  console.log("ERROR=" + String(e).split("\n")[0]);
} finally {
  await browser.close();
}
