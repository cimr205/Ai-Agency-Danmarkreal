import type { CalendarItem, EventColor } from './model';

/**
 * The reference design's sample week, for local development only: shown when
 * the app runs in dev mode with `?demo=1`. Never written to the database and
 * never active in production builds.
 */
export function isDemoMode(): boolean {
  return import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo');
}

type Seed = [day: number, title: string, from: string, to: string, color: EventColor, avatars?: number];

// day 0 = first column of the strip ("tue 18" in the reference).
const SEED: Seed[] = [
  [0, 'Emails design', '9:00', '11:20', 'blue', 3],
  [0, 'UX meeting', '11:20', '12:20', 'lilac'],
  [0, 'Develop meeting', '12:30', '13:40', 'purple'],
  [1, 'Youtube video', '8:20', '9:40', 'lavender'],
  [1, 'Designers meeting', '9:50', '10:30', 'lilac'],
  [1, 'Brain storm', '11:10', '12:50', 'mint'],
  [2, '(No Title)', '8:00', '9:30', 'grey'],
  [2, 'Breakfast', '9:30', '10:50', 'grey'],
  [2, 'Team meeting', '10:50', '12:20', 'lavender', 2],
  [3, 'Launch Time', '11:30', '12:40', 'lilac'],
  [3, 'Designers meet', '12:50', '14:30', 'lilac'],
  [4, 'Landing Page', '8:00', '10:00', 'blue'],
  [4, 'Responsive Design', '10:10', '11:10', 'lilac', 2],
  [4, 'UX meeting', '12:00', '13:30', 'lavender'],
  [5, 'Study time', '8:00', '9:20', 'lavender'],
  [5, 'Motion design', '9:20', '10:30', 'lilac', 3],
  [5, 'New Project', '10:30', '12:10', 'blue'],
];

const at = (anchor: Date, day: number, hm: string) => {
  const [h, m] = hm.split(':').map(Number);
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + day, h, m);
};

export const DEMO_AVATAR_IDS = ['demo-a', 'demo-b', 'demo-c'];

export function demoEvents(anchor: Date): CalendarItem[] {
  return SEED.map(([day, title, from, to, color, avatars], i) => ({
    id: `demo-${i}`,
    title,
    start: at(anchor, day, from),
    end: at(anchor, day, to),
    color,
    source: 'events',
    kind: title === 'Responsive Design' ? 'appointment' : 'project',
    category: (['work', 'personal', 'education'] as const)[i % 3],
    attendeeIds: DEMO_AVATAR_IDS.slice(0, avatars ?? 0),
    allDay: false,
    editable: true,
  }));
}
