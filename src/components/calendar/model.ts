import type { CalendarEventRow } from '@/hooks/api/useCalendar';

export type EventColor = 'blue' | 'lavender' | 'lilac' | 'grey' | 'mint' | 'purple';
export type EventKind = 'project' | 'appointment' | 'reminder' | 'personal';
export type EventCategory = 'work' | 'personal' | 'education';
export type CalendarSource = 'events' | 'tasks' | 'external';
export type CalendarView = 'month' | 'week' | 'day';

/** bg / title / time colours per event colour (design spec §1). */
export const EVENT_COLORS: Record<EventColor, { bg: string; title: string; time: string }> = {
  blue: { bg: '#D4E4EE', title: '#1F2933', time: '#7A8590' },
  lavender: { bg: '#BEB2F4', title: '#2B2350', time: '#5D5390' },
  lilac: { bg: '#E4E1F6', title: '#2B2B35', time: '#8A879C' },
  grey: { bg: '#E4E4E7', title: '#3F3F46', time: '#8E8E93' },
  mint: { bg: '#D3E6E4', title: '#4E8E8A', time: '#7FAAA7' },
  purple: { bg: '#C9BDF5', title: '#3A2E7A', time: '#6C61A8' },
};

export const CATEGORY_DOTS: Record<EventCategory, string> = {
  work: '#A99BF2',
  personal: '#D7CCF7',
  education: '#C3DAE8',
};

export const EVENT_KINDS: EventKind[] = ['project', 'appointment', 'reminder', 'personal'];
export const CATEGORIES: EventCategory[] = ['work', 'personal', 'education'];
export const SOURCES: CalendarSource[] = ['events', 'tasks', 'external'];

/** One shape for everything the calendar draws. */
export interface CalendarItem {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color: EventColor;
  source: CalendarSource;
  kind: EventKind;
  category: EventCategory | null;
  attendeeIds: string[];
  /** Date-only items (tasks) render as chips, not timed blocks. */
  allDay: boolean;
  editable: boolean;
  url?: string | null;
  /** Persisted calendar_events row, when the item is one. */
  row?: CalendarEventRow;
}

const isColor = (c: unknown): c is EventColor => typeof c === 'string' && c in EVENT_COLORS;
const isCategory = (c: unknown): c is EventCategory => c === 'work' || c === 'personal' || c === 'education';

/** Legacy rows use 'meeting'; the UI's closest kind is an appointment. */
export function kindFromEventType(t: string | null | undefined): EventKind {
  return t === 'project' || t === 'reminder' || t === 'personal' ? t : 'appointment';
}

export function fromEventRow(row: CalendarEventRow, currentUserId: string | undefined): CalendarItem {
  return {
    id: row.id,
    title: row.title,
    start: new Date(row.start_time),
    end: new Date(row.end_time),
    color: isColor(row.color) ? row.color : 'blue',
    source: 'events',
    kind: kindFromEventType(row.event_type),
    category: isCategory(row.category) ? row.category : null,
    attendeeIds: row.attendee_ids ?? [],
    allDay: false,
    editable: !!currentUserId && row.created_by === currentUserId,
    row,
  };
}

export function fromTask(t: { id: string; title: string; due_date: string | null }): CalendarItem | null {
  if (!t.due_date) return null;
  const [y, m, d] = t.due_date.slice(0, 10).split('-').map(Number);
  const start = new Date(y, m - 1, d);
  return {
    id: `task-${t.id}`,
    title: t.title,
    start,
    end: new Date(y, m - 1, d, 23, 59),
    color: 'grey',
    source: 'tasks',
    kind: 'reminder',
    category: null,
    attendeeIds: [],
    allDay: true,
    editable: false,
  };
}

export function fromExternal(e: { id: string; title: string; startTime: string; endTime: string | null; url: string | null }): CalendarItem {
  const start = new Date(e.startTime);
  const end = e.endTime ? new Date(e.endTime) : new Date(start.getTime() + 30 * 60000);
  return {
    id: `ext-${e.id}`,
    title: e.title,
    start,
    end,
    color: 'mint',
    source: 'external',
    kind: 'appointment',
    category: null,
    attendeeIds: [],
    allDay: false,
    editable: false,
    url: e.url,
  };
}
