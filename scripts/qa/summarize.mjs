#!/usr/bin/env node
/**
 * Summarize docs/qa/results.json (Playwright JSON reporter) into a compact,
 * machine-readable docs/qa/results-summary.json + a human line table.
 * Honest by construction: a spec that did not run is NOT_TESTED, never PASS.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const RESULTS = "docs/qa/results.json";
const OUT = "docs/qa/results-summary.json";

if (!existsSync(RESULTS)) {
  console.error(`No ${RESULTS} yet — run a QA pass first (npm run qa:smoke).`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(RESULTS, "utf8"));
const byModule = {};

function walk(suite, trail = []) {
  for (const s of suite.suites ?? []) walk(s, [...trail, s.title]);
  for (const spec of suite.specs ?? []) {
    // module is the first segment of the top describe title "module › Label"
    const describeTitle = trail.find((t) => t.includes("›")) || trail[0] || "unknown";
    const mod = describeTitle.split("›")[0].trim();
    const ok = spec.tests?.every((t) => t.results?.every((r) => r.status === "passed" || r.status === "skipped"));
    const ran = spec.tests?.some((t) => t.results?.some((r) => r.status !== "skipped"));
    byModule[mod] ??= { pass: 0, fail: 0, skipped: 0 };
    if (!ran) byModule[mod].skipped++;
    else if (ok) byModule[mod].pass++;
    else byModule[mod].fail++;
  }
}
for (const s of data.suites ?? []) walk(s);

const summary = Object.entries(byModule).map(([module, c]) => ({
  module,
  status: c.fail > 0 ? "FAIL" : c.pass > 0 ? "PASS" : "NOT_TESTED",
  ...c,
}));

writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), modules: summary }, null, 2));

console.log("\nModule        Status      pass/fail/skip");
console.log("────────────────────────────────────────");
for (const m of summary) {
  console.log(`${m.module.padEnd(13)} ${m.status.padEnd(11)} ${m.pass}/${m.fail}/${m.skipped}`);
}
console.log(`\nWrote ${OUT}`);
