#!/usr/bin/env node
/** Verify a saved storageState is a usable authenticated session (dashboard
 * loads, not bounced to onboarding/login). */
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE_URL || "http://localhost:8080";
const state = process.env.QA_STATE;
if (!state) { console.error("QA_STATE required"); process.exit(2); }

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ storageState: state });
const page = await ctx.newPage();
await page.goto(`${BASE}/en/app/dashboard`, { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
console.log("URL=" + page.url());
const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 220);
console.log("BODY=" + body);
await browser.close();
