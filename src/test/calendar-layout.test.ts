import { describe, expect, it } from 'vitest';
import { HOUR_HEIGHT, gmtLabel, layoutDay, minutesFromOffset } from '@/lib/calendar/layout';

const day = new Date(2026, 9, 21);
const at = (h: number, m = 0, d = 21) => new Date(2026, 9, d, h, m);
const ev = (id: string, s: Date, e: Date) => ({ id, start: s, end: e });

describe('layoutDay', () => {
  it('positions a single event by its start and duration', () => {
    const [p] = layoutDay(day, [ev('a', at(9), at(11, 20))]);
    expect(p.top).toBe(9 * HOUR_HEIGHT);
    expect(p.height).toBeCloseTo((140 / 60) * HOUR_HEIGHT);
    expect([p.lane, p.lanes]).toEqual([0, 1]);
  });

  it('puts overlapping events side by side', () => {
    const out = layoutDay(day, [ev('a', at(11, 20), at(16)), ev('b', at(12, 10), at(13, 40))]);
    const a = out.find(o => o.item.id === 'a')!;
    const b = out.find(o => o.item.id === 'b')!;
    expect([a.lane, a.lanes]).toEqual([0, 2]);
    expect([b.lane, b.lanes]).toEqual([1, 2]);
  });

  it('keeps back-to-back events in a single lane', () => {
    const out = layoutDay(day, [ev('a', at(8), at(9, 30)), ev('b', at(9, 30), at(10, 50)), ev('c', at(10, 50), at(12, 20))]);
    expect(out.every(o => o.lanes === 1 && o.lane === 0)).toBe(true);
  });

  it('reuses a freed lane inside a cluster', () => {
    const out = layoutDay(day, [ev('a', at(9), at(12)), ev('b', at(9), at(10)), ev('c', at(10), at(11))]);
    expect(out.find(o => o.item.id === 'c')!.lane).toBe(1);
    expect(out.every(o => o.lanes === 2)).toBe(true);
  });

  it('clips events that cross midnight and skips other days', () => {
    const out = layoutDay(day, [ev('a', at(23), at(2, 0, 22)), ev('b', at(9, 0, 20), at(10, 0, 20))]);
    expect(out).toHaveLength(1);
    expect(out[0].top + out[0].height).toBeCloseTo(24 * HOUR_HEIGHT);
  });

  it('gives very short events a minimum height', () => {
    expect(layoutDay(day, [ev('a', at(9), at(9, 5))])[0].height).toBeGreaterThanOrEqual(22);
  });
});

describe('minutesFromOffset', () => {
  it('snaps to 30 minute slots and stays inside the day', () => {
    expect(minutesFromOffset(9.6 * HOUR_HEIGHT)).toBe(9 * 60 + 30);
    expect(minutesFromOffset(-10)).toBe(0);
    expect(minutesFromOffset(30 * HOUR_HEIGHT)).toBe(23 * 60 + 30);
  });
});

describe('gmtLabel', () => {
  it('formats the UTC offset', () => {
    expect(gmtLabel()).toMatch(/^GMT[+-]\d{1,2}(:\d{2})?$/);
  });
});
