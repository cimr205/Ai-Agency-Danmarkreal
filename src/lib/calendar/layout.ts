/**
 * Pure layout maths for the calendar time grid. Kept free of React so it can
 * be unit tested and reused by the week and day views.
 */

export const HOUR_HEIGHT = 76;
export const MINUTES_PER_DAY = 24 * 60;

export interface TimedItem {
  id: string;
  start: Date;
  end: Date;
}

export interface PositionedItem<T extends TimedItem> {
  item: T;
  /** px from the top of the day column (midnight). */
  top: number;
  height: number;
  /** 0-based lane within its overlap cluster, and the cluster's lane count. */
  lane: number;
  lanes: number;
}

const MIN_HEIGHT = 22;

function minutesInto(day: Date, d: Date): number {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  return (d.getTime() - dayStart) / 60000;
}

/**
 * Positions items that intersect `day` within a 24h column. Items that
 * overlap in time share the column side by side (greedy lane assignment per
 * overlap cluster), so nothing is drawn on top of anything else.
 */
export function layoutDay<T extends TimedItem>(day: Date, items: T[], hourHeight = HOUR_HEIGHT): PositionedItem<T>[] {
  const pxPerMin = hourHeight / 60;
  const clipped = items
    .map(item => ({ item, rawS: minutesInto(day, item.start), rawE: minutesInto(day, item.end) }))
    // Zero-length events still count if they start inside the day.
    .filter(x => x.rawS < MINUTES_PER_DAY && (x.rawE > 0 || (x.rawE === x.rawS && x.rawS >= 0)))
    .map(({ item, rawS, rawE }) => {
      const s = Math.max(0, rawS);
      const e = Math.min(MINUTES_PER_DAY, rawE);
      return { item, s, e: Math.max(e, s + 1) };
    })
    .sort((a, b) => a.s - b.s || b.e - a.e);

  const out: PositionedItem<T>[] = [];
  let cluster: { x: (typeof clipped)[number]; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const { x, lane } of cluster) {
      out.push({
        item: x.item,
        top: x.s * pxPerMin,
        height: Math.max(MIN_HEIGHT, (x.e - x.s) * pxPerMin),
        lane,
        lanes,
      });
    }
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };

  for (const x of clipped) {
    if (cluster.length && x.s >= clusterEnd) flush();
    let lane = laneEnds.findIndex(end => end <= x.s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(x.e);
    } else {
      laneEnds[lane] = x.e;
    }
    cluster.push({ x, lane });
    clusterEnd = Math.max(clusterEnd, x.e);
  }
  if (cluster.length) flush();
  return out;
}

/** Snaps a y offset (px from midnight) to a slot start, in minutes. */
export function minutesFromOffset(y: number, hourHeight = HOUR_HEIGHT, snap = 30): number {
  const minutes = (y / hourHeight) * 60;
  return Math.min(MINUTES_PER_DAY - snap, Math.max(0, Math.floor(minutes / snap) * snap));
}

/** "GMT+2" style label for the viewer's current UTC offset. */
export function gmtLabel(date = new Date()): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const h = Math.floor(Math.abs(offset) / 60);
  const m = Math.abs(offset) % 60;
  return `GMT${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}
