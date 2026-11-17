import type { Ga4DailyRow, Ga4LandingRow, GscDailyRow, GscQueryPageRow } from '@/hooks/api/useGrowthAnalytics';

// Pure aggregation for the Growth OS analytics dashboard. GA4 (sessions) and
// Search Console (clicks) are kept apart on purpose: they measure different things.

export const ORGANIC = 'Organic Search';
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface Range { from: string; to: string }
/** The last `days` days ending at `lastDay`, and the same length right before. */
export function comparePeriods(lastDay: string, days: number): { current: Range; previous: Range } {
  const end = Date.parse(`${lastDay}T00:00:00Z`);
  return {
    current: { from: iso(end - (days - 1) * DAY), to: lastDay },
    previous: { from: iso(end - (2 * days - 1) * DAY), to: iso(end - days * DAY) },
  };
}

const within = (d: string, r: Range) => d >= r.from && d <= r.to;

export interface Ga4Totals { sessions: number; organicSessions: number; activeUsersDailySum: number; engagedSessions: number; keyEvents: number; organicKeyEvents: number; engagementRate: number | null }
export function ga4Totals(rows: Ga4DailyRow[], r: Range): Ga4Totals {
  const t = { sessions: 0, organicSessions: 0, activeUsersDailySum: 0, engagedSessions: 0, keyEvents: 0, organicKeyEvents: 0 };
  for (const x of rows) {
    if (!within(x.day, r)) continue;
    t.sessions += x.sessions; t.activeUsersDailySum += x.active_users; t.engagedSessions += x.engaged_sessions; t.keyEvents += Number(x.key_events);
    if (x.channel_group === ORGANIC) { t.organicSessions += x.sessions; t.organicKeyEvents += Number(x.key_events); }
  }
  return { ...t, engagementRate: t.sessions ? t.engagedSessions / t.sessions : null };
}

/** Relative change; null when there is no baseline (never a made-up percentage). */
export function change(current: number, previous: number): number | null {
  return previous ? (current - previous) / previous : null;
}

export function channels(rows: Ga4DailyRow[], r: Range) {
  const m = new Map<string, number>();
  for (const x of rows) if (within(x.day, r)) m.set(x.channel_group, (m.get(x.channel_group) ?? 0) + x.sessions);
  return [...m.entries()].map(([channel, sessions]) => ({ channel, sessions })).sort((a, b) => b.sessions - a.sessions);
}

export function dailySeries(ga4: Ga4DailyRow[], gsc: GscDailyRow[], r: Range) {
  const m = new Map<string, { day: string; sessions: number; organicSessions: number; clicks: number | null }>();
  for (let t = Date.parse(`${r.from}T00:00:00Z`); t <= Date.parse(`${r.to}T00:00:00Z`); t += DAY) m.set(iso(t), { day: iso(t), sessions: 0, organicSessions: 0, clicks: null });
  for (const x of ga4) {
    const d = m.get(x.day);
    if (!d) continue;
    d.sessions += x.sessions;
    if (x.channel_group === ORGANIC) d.organicSessions += x.sessions;
  }
  for (const x of gsc) { const d = m.get(x.day); if (d) d.clicks = x.clicks; }
  return [...m.values()];
}

export interface GscTotals { clicks: number; impressions: number; ctr: number | null; position: number | null }
export function gscTotals(rows: GscDailyRow[], r: Range): GscTotals {
  let clicks = 0, impressions = 0, posW = 0;
  for (const x of rows) if (within(x.day, r)) { clicks += x.clicks; impressions += x.impressions; posW += Number(x.position) * x.impressions; }
  return { clicks, impressions, ctr: impressions ? clicks / impressions : null, position: impressions ? posW / impressions : null };
}

export function topBy(rows: GscQueryPageRow[], r: Range, key: 'query' | 'page', limit = 15) {
  const m = new Map<string, { key: string; clicks: number; impressions: number; posW: number }>();
  for (const x of rows) {
    if (!within(x.day, r)) continue;
    const k = x[key];
    const a = m.get(k) ?? { key: k, clicks: 0, impressions: 0, posW: 0 };
    a.clicks += x.clicks; a.impressions += x.impressions; a.posW += Number(x.position) * x.impressions;
    m.set(k, a);
  }
  return [...m.values()].map((a) => ({ key: a.key, clicks: a.clicks, impressions: a.impressions, ctr: a.impressions ? a.clicks / a.impressions : 0, position: a.impressions ? a.posW / a.impressions : 0 }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions).slice(0, limit);
}

export function topLanding(rows: Ga4LandingRow[], r: Range, limit = 15) {
  const m = new Map<string, { page: string; sessions: number; organicSessions: number; engaged: number; keyEvents: number }>();
  for (const x of rows) {
    if (!within(x.day, r)) continue;
    const a = m.get(x.landing_page) ?? { page: x.landing_page, sessions: 0, organicSessions: 0, engaged: 0, keyEvents: 0 };
    a.sessions += x.sessions; a.engaged += x.engaged_sessions; a.keyEvents += Number(x.key_events);
    if (x.channel_group === ORGANIC) a.organicSessions += x.sessions;
    m.set(x.landing_page, a);
  }
  return [...m.values()].sort((a, b) => b.organicSessions - a.organicSessions || b.sessions - a.sessions).slice(0, limit);
}
