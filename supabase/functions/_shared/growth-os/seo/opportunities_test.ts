import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { findOpportunities, type LandingRow, measureOutcome, periods, type QPRow } from "./opportunities.ts";

const P = periods("2026-11-14");
const day = (offset: number) => new Date(Date.parse("2026-11-14T00:00:00Z") - offset * 86_400_000).toISOString().slice(0, 10);

// 10 "normal" query/page pairs at position ~5 with CTR ~8% so the site median exists.
function baseline(): QPRow[] {
  const rows: QPRow[] = [];
  for (let i = 0; i < 10; i++) rows.push({ day: day(3), query: `q${i}`, page: `https://x.dk/p${i}`, clicks: 8, impressions: 100, position: 5 });
  return rows;
}

Deno.test("periods are two adjacent 28-day windows", () => {
  assertEquals(P.current, { from: "2026-10-18", to: "2026-11-14" });
  assertEquals(P.previous, { from: "2026-09-20", to: "2026-10-17" });
});

Deno.test("CTR gap uses the site's own median and states the estimate as uncertain", () => {
  const rows = [...baseline(), { day: day(2), query: "crm system", page: "https://x.dk/crm", clicks: 4, impressions: 1000, position: 5 }];
  const rec = findOpportunities(rows, [], P).find((r) => r.kind === "ctr_gap")!;
  assertEquals(rec.target, "https://x.dk/crm");
  assertEquals(rec.evidence.site_median_ctr, 0.08);
  assertEquals(rec.evidence.ctr, 0.004);
  assertEquals(rec.value, 76); // 1000 × (0.08 − 0.004)
  assertEquals(rec.priority, 1);
  assert(/Estimate/.test(rec.expected_effect) && /Uncertain/.test(rec.expected_effect));
});

Deno.test("no CTR-gap claim without enough peers to compare with", () => {
  const rows = [{ day: day(2), query: "crm", page: "https://x.dk/crm", clicks: 1, impressions: 1000, position: 5 }];
  assertEquals(findOpportunities(rows, [], P).filter((r) => r.kind === "ctr_gap").length, 0);
});

Deno.test("striking distance at positions 8–20 with demand", () => {
  const rows = [...baseline(), { day: day(2), query: "crm til smv", page: "https://x.dk/smv", clicks: 1, impressions: 300, position: 12 }];
  const rec = findOpportunities(rows, [], P).find((r) => r.kind === "striking_distance")!;
  assertEquals(rec.evidence.position, 12);
  assertEquals(rec.value, Math.round(300 * (0.08 - 1 / 300)));
});

Deno.test("traffic drop compares the same page across the two periods", () => {
  const rows: QPRow[] = [
    { day: day(40), query: "a", page: "https://x.dk/drop", clicks: 100, impressions: 1000, position: 3 },
    { day: day(5), query: "a", page: "https://x.dk/drop", clicks: 40, impressions: 900, position: 6 },
    { day: day(40), query: "b", page: "https://x.dk/stable", clicks: 50, impressions: 500, position: 3 },
    { day: day(5), query: "b", page: "https://x.dk/stable", clicks: 48, impressions: 500, position: 3 },
  ];
  const drops = findOpportunities(rows, [], P).filter((r) => r.kind === "traffic_drop");
  assertEquals(drops.map((r) => r.target), ["https://x.dk/drop"]);
  assertEquals(drops[0].evidence.clicks_before, 100);
  assertEquals(drops[0].evidence.clicks_after, 40);
  assertEquals(drops[0].evidence.position_change, 3);
});

Deno.test("no-key-events only when the property records key events at all", () => {
  const landing: LandingRow[] = [
    { day: day(3), landing_page: "/da/pricing", channel_group: "Organic Search", sessions: 80, key_events: 0 },
    { day: day(3), landing_page: "/da/signup", channel_group: "Organic Search", sessions: 30, key_events: 5 },
  ];
  assertEquals(findOpportunities([], landing, P).map((r) => r.target), ["/da/pricing"]);
  const noneTracked = landing.map((r) => ({ ...r, key_events: 0 }));
  assertEquals(findOpportunities([], noneTracked, P).length, 0); // missing tracking is not a page problem
});

Deno.test("no data, no recommendations", () => assertEquals(findOpportunities([], [], P), []));

Deno.test("before/after is labelled correlation and uses 28 days each side", () => {
  const rows: QPRow[] = [
    { day: "2026-10-01", query: "a", page: "https://x.dk/p", clicks: 10, impressions: 100, position: 5 },
    { day: "2026-10-20", query: "a", page: "https://x.dk/p", clicks: 25, impressions: 120, position: 4 },
  ];
  const o = measureOutcome("ctr_gap", "https://x.dk/p", "a", rows, [], "2026-10-10");
  assertEquals([o.before.clicks, o.after.clicks, o.change, o.change_pct], [10, 25, 15, 1.5]);
  assertEquals(o.classification, "correlation");
});
