#!/usr/bin/env node
/** Audit serious/moderate axe violations on given routes (default: auth pages). */
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.QA_BASE_URL || "http://localhost:8080";
const routes = (process.env.QA_ROUTES || "en/auth/login,en/auth/signup,en/auth/forgot-password").split(",");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext();
await ctx.addInitScript(() => {
  try { localStorage.setItem("cookie-consent", JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: new Date().toISOString() })); } catch { /* ignore */ }
});
const page = await ctx.newPage();

for (const r of routes) {
  await page.goto(`${BASE}/${r}`, { waitUntil: "networkidle" });
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]).analyze();
  const notable = res.violations.filter((v) => ["critical", "serious", "moderate"].includes(v.impact));
  console.log(`\n=== ${r} === (${notable.length} notable)`);
  for (const v of notable) {
    console.log(`  [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node(s))`);
    console.log(`     e.g. ${v.nodes[0]?.target?.join(" ")}`.slice(0, 180));
  }
}
await browser.close();
