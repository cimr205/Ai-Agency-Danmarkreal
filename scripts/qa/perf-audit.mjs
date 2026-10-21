#!/usr/bin/env node
/** Performance on the PRODUCTION build (vite preview). Measures FCP/LCP/load on
 * public routes. Fails if LCP exceeds a reasonable SPA budget. */
import { chromium } from "@playwright/test";

const BASE = process.env.QA_BASE_URL || "http://localhost:4173";
const routes = (process.env.QA_ROUTES || "en/auth/login,en/privacy,en/auth/signup").split(",");
const LCP_BUDGET_MS = 4000;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
for (const r of routes) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${r}`, { waitUntil: "load" });
  const m = await page.evaluate(() => new Promise((resolve) => {
    let lcp = 0;
    try {
      new PerformanceObserver((list) => { for (const e of list.getEntries()) lcp = e.startTime; })
        .observe({ type: "largest-contentful-paint", buffered: true });
    } catch { /* ignore */ }
    setTimeout(() => {
      const nav = performance.getEntriesByType("navigation")[0] || {};
      const fcp = (performance.getEntriesByType("paint").find((p) => p.name === "first-contentful-paint") || {}).startTime || 0;
      resolve({
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
        load: Math.round(nav.loadEventEnd || 0),
        fcp: Math.round(fcp),
        lcp: Math.round(lcp),
        transferKB: Math.round((nav.transferSize || 0) / 1024),
      });
    }, 1800);
  }));
  results.push({ route: r, ...m });
  await ctx.close();
}
await browser.close();

console.log("route".padEnd(22) + "FCP    LCP    DCL    load   KB");
let fail = false;
for (const m of results) {
  console.log(m.route.padEnd(22) + `${m.fcp}`.padEnd(7) + `${m.lcp}`.padEnd(7) + `${m.domContentLoaded}`.padEnd(7) + `${m.load}`.padEnd(7) + m.transferKB);
  if (m.lcp > LCP_BUDGET_MS) { console.log(`  FAIL ${m.route}: LCP ${m.lcp}ms > ${LCP_BUDGET_MS}ms budget`); fail = true; }
}
process.exit(fail ? 1 : 0);
