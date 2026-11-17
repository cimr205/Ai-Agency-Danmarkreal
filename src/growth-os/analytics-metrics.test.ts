import { describe, expect, it } from 'vitest';
import { change, channels, comparePeriods, dailySeries, ga4Totals, gscTotals, topBy, topLanding } from './analytics-metrics';

const p = comparePeriods('2026-11-14', 28);
const ga4 = [
  { day: '2026-11-10', channel_group: 'Organic Search', sessions: 30, active_users: 25, engaged_sessions: 20, key_events: 2 },
  { day: '2026-11-10', channel_group: 'Direct', sessions: 10, active_users: 9, engaged_sessions: 4, key_events: 1 },
  { day: '2026-10-01', channel_group: 'Organic Search', sessions: 20, active_users: 18, engaged_sessions: 10, key_events: 0 },
];

describe('analytics metrics', () => {
  it('splits current and previous 28-day periods', () => {
    expect(p).toEqual({ current: { from: '2026-10-18', to: '2026-11-14' }, previous: { from: '2026-09-20', to: '2026-10-17' } });
  });
  it('totals GA4 per period and keeps organic separate', () => {
    expect(ga4Totals(ga4, p.current)).toEqual({ sessions: 40, organicSessions: 30, activeUsersDailySum: 34, engagedSessions: 24, keyEvents: 3, organicKeyEvents: 2, engagementRate: 0.6 });
    expect(ga4Totals(ga4, p.previous).organicSessions).toBe(20);
    expect(change(30, 20)).toBe(0.5);
  });
  it('never invents a change without a baseline, or a rate without sessions', () => {
    expect(change(5, 0)).toBeNull();
    expect(ga4Totals([], p.current).engagementRate).toBeNull();
    expect(gscTotals([], p.current)).toEqual({ clicks: 0, impressions: 0, ctr: null, position: null });
  });
  it('ranks channels and builds a daily series with GSC clicks as their own field', () => {
    expect(channels(ga4, p.current)).toEqual([{ channel: 'Organic Search', sessions: 30 }, { channel: 'Direct', sessions: 10 }]);
    const s = dailySeries(ga4, [{ day: '2026-11-10', clicks: 7, impressions: 70, ctr: 0.1, position: 3 }], p.current);
    expect(s).toHaveLength(28);
    expect(s.find((d) => d.day === '2026-11-10')).toEqual({ day: '2026-11-10', sessions: 40, organicSessions: 30, clicks: 7 });
    expect(s.find((d) => d.day === '2026-11-11')!.clicks).toBeNull(); // no data is not zero
  });
  it('weights Search Console position by impressions and aggregates top queries/pages', () => {
    const rows = [
      { day: '2026-11-10', query: 'crm', page: 'https://x.dk/', clicks: 10, impressions: 100, position: 2 },
      { day: '2026-11-11', query: 'crm', page: 'https://x.dk/', clicks: 0, impressions: 300, position: 6 },
      { day: '2026-11-11', query: 'crm system', page: 'https://x.dk/crm', clicks: 5, impressions: 50, position: 4 },
    ];
    expect(topBy(rows, p.current, 'query')[0]).toEqual({ key: 'crm', clicks: 10, impressions: 400, ctr: 0.025, position: 5 });
    expect(topBy(rows, p.current, 'page').map((r) => r.key)).toEqual(['https://x.dk/', 'https://x.dk/crm']);
    expect(gscTotals([{ day: '2026-11-10', clicks: 4, impressions: 100, ctr: 0.04, position: 2 }, { day: '2026-11-11', clicks: 6, impressions: 300, ctr: 0.02, position: 6 }], p.current)).toEqual({ clicks: 10, impressions: 400, ctr: 0.025, position: 5 });
  });
  it('orders landing pages by organic sessions', () => {
    const l = [
      { day: '2026-11-10', landing_page: '/a', channel_group: 'Direct', sessions: 50, engaged_sessions: 10, key_events: 0 },
      { day: '2026-11-10', landing_page: '/b', channel_group: 'Organic Search', sessions: 20, engaged_sessions: 10, key_events: 1 },
    ];
    expect(topLanding(l, p.current).map((x) => x.page)).toEqual(['/b', '/a']);
  });
});
