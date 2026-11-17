// SEO opportunities from verified data only (Search Console + GA4 snapshots).
// Every number in a recommendation comes from the rows passed in; benchmarks are
// the site's OWN medians, never external CTR curves. Expected effects are
// estimates and say so. Before/after comparisons are labelled as correlation.

export interface QPRow { day: string; query: string; page: string; clicks: number; impressions: number; position: number }
export interface LandingRow { day: string; landing_page: string; channel_group: string; sessions: number; key_events: number }

export type RecKind = "ctr_gap" | "traffic_drop" | "no_key_events" | "striking_distance";

export interface Recommendation {
  fingerprint: string;
  kind: RecKind;
  target: string;
  problem: string;
  evidence: Record<string, unknown>;
  action: string;
  priority: 1 | 2 | 3;
  expected_effect: string;
  /** Used for ranking only: estimated extra clicks or sessions per 28 days. */
  value: number;
}

export interface Periods { current: { from: string; to: string }; previous: { from: string; to: string } }

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Two adjacent 28-day windows ending at `lastDay` (inclusive). */
export function periods(lastDay: string, days = 28): Periods {
  const end = Date.parse(`${lastDay}T00:00:00Z`);
  return {
    current: { from: iso(end - (days - 1) * DAY), to: lastDay },
    previous: { from: iso(end - (2 * days - 1) * DAY), to: iso(end - days * DAY) },
  };
}

const inRange = (d: string, r: { from: string; to: string }) => d >= r.from && d <= r.to;
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const pct = (n: number) => `${round(n * 100)}%`;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

interface Agg { clicks: number; impressions: number; posWeighted: number }
function aggregate<K>(rows: QPRow[], key: (r: QPRow) => K) {
  const m = new Map<K, Agg>();
  for (const r of rows) {
    const k = key(r);
    const a = m.get(k) ?? { clicks: 0, impressions: 0, posWeighted: 0 };
    a.clicks += r.clicks; a.impressions += r.impressions; a.posWeighted += r.position * r.impressions;
    m.set(k, a);
  }
  return m;
}
const ctrOf = (a: Agg) => (a.impressions ? a.clicks / a.impressions : 0);
const posOf = (a: Agg) => (a.impressions ? a.posWeighted / a.impressions : 0);
const bucket = (pos: number) => (pos <= 3 ? "1-3" : pos <= 6 ? "4-6" : pos <= 10 ? "7-10" : pos <= 20 ? "11-20" : "21+");
const priorityFor = (value: number): 1 | 2 | 3 => (value >= 50 ? 1 : value >= 15 ? 2 : 3);

export function findOpportunities(qp: QPRow[], landing: LandingRow[], p: Periods): Recommendation[] {
  const recs: Recommendation[] = [];
  const cur = qp.filter((r) => inRange(r.day, p.current));
  const prev = qp.filter((r) => inRange(r.day, p.previous));
  const period = `${p.current.from}..${p.current.to}`;

  // Site's own CTR benchmark per position bucket (query+page pairs with ≥ 20 impressions).
  const pairs = aggregate(cur, (r) => `${r.query}\u0000${r.page}`);
  const byBucket = new Map<string, number[]>();
  for (const a of pairs.values()) {
    if (a.impressions < 20) continue;
    const b = bucket(posOf(a));
    byBucket.set(b, [...(byBucket.get(b) ?? []), ctrOf(a)]);
  }

  for (const [k, a] of pairs) {
    const [query, page] = k.split("\u0000");
    const pos = posOf(a), ctr = ctrOf(a);
    const bench = median(byBucket.get(bucket(pos)) ?? []);
    const peers = byBucket.get(bucket(pos))?.length ?? 0;

    // 1) CTR gap: ranks on page 1 but gets far fewer clicks than the site's own pages at that position.
    if (pos <= 10 && a.impressions >= 200 && bench !== null && peers >= 5 && ctr < bench * 0.5) {
      const extra = Math.round(a.impressions * (bench - ctr));
      recs.push({
        fingerprint: `ctr_gap|${query}|${page}`, kind: "ctr_gap", target: page,
        problem: `"${query}" shows on page 1 (avg. position ${round(pos)}) but CTR is ${pct(ctr)} vs. the site's median ${pct(bench)} at that position.`,
        evidence: { source: "search_console", period, query, page, impressions: a.impressions, clicks: a.clicks, ctr: round(ctr, 4), position: round(pos), site_median_ctr: round(bench, 4), peers },
        action: `Rewrite the title and meta description of ${page} so they answer "${query}" directly and state the offer; keep the title under 60 characters.`,
        priority: priorityFor(extra), value: extra,
        expected_effect: `Estimate: up to ~${extra} extra clicks per 28 days if CTR reaches the site's own median. Uncertain: depends on the SERP layout and competitors; not a forecast.`,
      });
    }

    // 2) Striking distance: position 8–20 with real demand.
    if (pos >= 8 && pos <= 20 && a.impressions >= 100) {
      const top = median(byBucket.get("4-6") ?? []);
      const extra = top !== null ? Math.max(0, Math.round(a.impressions * (top - ctr))) : 0;
      recs.push({
        fingerprint: `striking_distance|${query}|${page}`, kind: "striking_distance", target: page,
        problem: `"${query}" averages position ${round(pos)} with ${a.impressions} impressions: close to page 1 but rarely clicked (${a.clicks} clicks).`,
        evidence: { source: "search_console", period, query, page, impressions: a.impressions, clicks: a.clicks, ctr: round(ctr, 4), position: round(pos), site_median_ctr_pos_4_6: top === null ? null : round(top, 4) },
        action: `Strengthen ${page} for "${query}": add a section that answers it, use the phrase in an h2, and link to the page from 2–3 related pages.`,
        priority: priorityFor(extra), value: extra,
        expected_effect: top === null
          ? "Estimate unavailable: the site has too little data at positions 4–6 to compare. Measure clicks before and after."
          : `Estimate: up to ~${extra} extra clicks per 28 days if it reaches positions 4–6 at the site's median CTR there. Uncertain: rankings may not move.`,
      });
    }
  }

  // 3) Traffic drop per page (Search Console clicks, 28 days vs. the 28 before).
  const pageCur = aggregate(cur, (r) => r.page), pagePrev = aggregate(prev, (r) => r.page);
  for (const [page, before] of pagePrev) {
    const after = pageCur.get(page) ?? { clicks: 0, impressions: 0, posWeighted: 0 };
    if (before.clicks < 20) continue;
    const change = (after.clicks - before.clicks) / before.clicks;
    if (change > -0.3) continue;
    const lost = before.clicks - after.clicks;
    const posChange = after.impressions && before.impressions ? round(posOf(after) - posOf(before)) : null;
    recs.push({
      fingerprint: `traffic_drop|${page}`, kind: "traffic_drop", target: page,
      problem: `Organic clicks to ${page} fell ${pct(-change)} (${before.clicks} → ${after.clicks}).`,
      evidence: { source: "search_console", period, previous_period: `${p.previous.from}..${p.previous.to}`, clicks_before: before.clicks, clicks_after: after.clicks, impressions_before: before.impressions, impressions_after: after.impressions, position_change: posChange },
      action: posChange !== null && posChange > 1
        ? `Rankings slipped (avg. position +${posChange}). Check ${page} for recent content or technical changes and compare it with the pages now ranking above it.`
        : `Impressions or CTR fell rather than position. Check seasonality and whether the page's title or snippet changed.`,
      priority: priorityFor(lost), value: lost,
      expected_effect: `Recovering the previous level would be ~${lost} clicks per 28 days. Uncertain: the cause is not yet known.`,
    });
  }

  // 4) Organic landing pages with traffic but no key events (only if the property records key events at all).
  const propertyHasKeyEvents = landing.some((r) => r.key_events > 0);
  const organic = landing.filter((r) => r.channel_group === "Organic Search" && inRange(r.day, p.current));
  const byPage = new Map<string, { sessions: number; key_events: number }>();
  for (const r of organic) {
    const a = byPage.get(r.landing_page) ?? { sessions: 0, key_events: 0 };
    a.sessions += r.sessions; a.key_events += r.key_events;
    byPage.set(r.landing_page, a);
  }
  if (propertyHasKeyEvents) {
    for (const [page, a] of byPage) {
      if (a.sessions < 50 || a.key_events > 0) continue;
      recs.push({
        fingerprint: `no_key_events|${page}`, kind: "no_key_events", target: page,
        problem: `${page} had ${a.sessions} organic sessions and 0 key events.`,
        evidence: { source: "ga4", period, organic_sessions: a.sessions, key_events: 0 },
        action: `Add a clear next step on ${page} (demo booking or sign-up) above the fold and check that the key event fires.`,
        priority: priorityFor(Math.round(a.sessions / 10)), value: Math.round(a.sessions / 10),
        expected_effect: "Estimate unavailable: no conversion rate on this page to compare with. Measure key events before and after.",
      });
    }
  }

  // Strongest first; at most 15 so a human can actually review them.
  return recs.sort((a, b) => a.priority - b.priority || b.value - a.value).slice(0, 15);
}

/** Before/after for an implemented recommendation: 28 days each side of implemented_on. Correlation only. */
export function measureOutcome(kind: RecKind, target: string, query: string | null, qp: QPRow[], landing: LandingRow[], implementedOn: string, days = 28) {
  const t = Date.parse(`${implementedOn}T00:00:00Z`);
  const before = { from: iso(t - days * DAY), to: iso(t - DAY) };
  const after = { from: iso(t + DAY), to: iso(t + days * DAY) };
  const sum = (r: { from: string; to: string }): Record<string, number> => {
    if (kind === "no_key_events") {
      const rows = landing.filter((x) => x.landing_page === target && x.channel_group === "Organic Search" && inRange(x.day, r));
      return { sessions: rows.reduce((s, x) => s + x.sessions, 0), key_events: rows.reduce((s, x) => s + x.key_events, 0) };
    }
    const rows = qp.filter((x) => x.page === target && (!query || x.query === query) && inRange(x.day, r));
    return { clicks: rows.reduce((s, x) => s + x.clicks, 0), impressions: rows.reduce((s, x) => s + x.impressions, 0) };
  };
  const b = sum(before), a = sum(after);
  const metric = kind === "no_key_events" ? "key_events" : "clicks";
  const bv = b[metric], av = a[metric];
  return {
    metric, before_period: before, after_period: after, before: b, after: a,
    change: av - bv, change_pct: bv ? round((av - bv) / bv, 3) : null,
    classification: "correlation",
    note: "Before/after on the same page. Seasonality, algorithm updates and other changes can explain the difference; this is not proof that the change caused it.",
  };
}
