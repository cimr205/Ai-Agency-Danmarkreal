import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, PanelLeft } from 'lucide-react';
import { addDays, addMonths, endOfMonth, format, isSameDay, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { da, de, enUS } from 'date-fns/locale';
import { toast } from 'sonner';
import { useI18n, isLocale } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { useTasks } from '@/hooks/api/useTasks';
import { useExternalCalendarEvents, useModuleAvailability } from '@/hooks/api/useIntegrations';
import {
  useCompanyMembers,
  useCreateCalendarEvent,
  useMyCalendar,
  useUpdateCalendarEvent,
  type CompanyMember,
} from '@/hooks/api/useCalendar';
import { CalendarSidebar } from '@/components/calendar/CalendarSidebar';
import { ViewSwitcher } from '@/components/calendar/ViewSwitcher';
import { DayHeaderStrip } from '@/components/calendar/DayHeaderStrip';
import { TimeGrid, type TimeGridHandle } from '@/components/calendar/TimeGrid';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { EventPopover } from '@/components/calendar/EventPopover';
import { GUTTER, weekColumnWidth } from '@/components/calendar/geometry';
import { DEMO_AVATAR_IDS, demoEvents, isDemoMode } from '@/components/calendar/demoEvents';
import {
  CATEGORIES,
  SOURCES,
  fromEventRow,
  fromExternal,
  fromTask,
  type CalendarItem,
  type CalendarSource,
  type CalendarView,
  type EventCategory,
  type EventColor,
  type EventKind,
} from '@/components/calendar/model';
import { cn } from '@/lib/utils';

const LOCALES = { da, de, en: enUS };
const KIND_COLOR: Record<EventKind, EventColor> = { project: 'blue', appointment: 'lilac', reminder: 'grey', personal: 'lavender' };
const PANEL_PAD_LEFT = 18;
const PANEL_PAD_RIGHT = 18;
const DRAFT_ID = 'draft';

/** Height from this element's top to the bottom of the viewport. */
function useFillViewport<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const update = () => {
      if (ref.current) setHeight(Math.max(480, window.innerHeight - ref.current.getBoundingClientRect().top));
    };
    update();
    window.addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    if (ref.current?.parentElement) ro.observe(ref.current.parentElement);
    return () => { window.removeEventListener('resize', update); ro.disconnect(); };
  }, []);
  return { ref, height };
}

/** The sidebar is mounted inline from 1024px, otherwise only inside the drawer. */
function useIsDesktop() {
  const query = '(min-width: 1024px)';
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return matches;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export default function CalendarPage() {
  const { t } = useI18n();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const dfLocale = LOCALES[locale] ?? enUS;
  const reduce = useReducedMotion();
  const { profile } = useAuth();
  const demo = isDemoMode();
  const isDesktop = useIsDesktop();

  const [today] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>('week');
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [direction, setDirection] = useState(0);
  const [sources, setSources] = useState<Set<CalendarSource>>(() => new Set(SOURCES));
  const [categories, setCategories] = useState<Set<EventCategory>>(() => new Set(CATEGORIES));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [popover, setPopover] = useState<{ item: CalendarItem; anchor: DOMRect } | null>(null);
  const [demoEdits, setDemoEdits] = useState<Record<string, Partial<CalendarItem>>>({});
  const [demoAdded, setDemoAdded] = useState<CalendarItem[]>([]);
  const [pendingJoin, setPendingJoin] = useState<string | null>(null);
  // A draft being saved stays on the grid until the refetch includes it.
  const [saving, setSaving] = useState<CalendarItem | null>(null);
  const gridRef = useRef<TimeGridHandle>(null);
  const gridScroll = useRef<number | null>(null);

  const fill = useFillViewport<HTMLDivElement>();
  const area = useWidth<HTMLDivElement>();

  // ── Visible range ──────────────────────────────────────────────────────
  const days = useMemo(
    () => (view === 'day' ? [selected] : Array.from({ length: 8 }, (_, i) => addDays(selected, i))),
    [view, selected],
  );
  const range = useMemo(() => {
    if (view === 'month') {
      const first = startOfWeek(startOfMonth(selected), { weekStartsOn: 1 });
      return { start: first, end: addDays(first, 42) };
    }
    return { start: days[0], end: addDays(days[days.length - 1], 1) };
  }, [view, selected, days]);

  // ── Data ───────────────────────────────────────────────────────────────
  const { data: rows } = useMyCalendar({ start: range.start.toISOString(), end: range.end.toISOString() });
  const { data: tasks } = useTasks();
  const { data: availability } = useModuleAvailability();
  const hasExternal = !!availability?.modules.find(m => m.module === 'calendar')?.available;
  const { data: external } = useExternalCalendarEvents(range.start.toISOString(), range.end.toISOString(), hasExternal);
  // Join always looks at today, whatever range is on screen.
  const todayStart = startOfDay(today);
  const todayEnd = addDays(todayStart, 1);
  const { data: todayRows } = useMyCalendar({ start: todayStart.toISOString(), end: todayEnd.toISOString() });
  const { data: todayExternal } = useExternalCalendarEvents(todayStart.toISOString(), todayEnd.toISOString(), hasExternal);
  const { data: memberList = [] } = useCompanyMembers();
  const createEvent = useCreateCalendarEvent();
  const updateEvent = useUpdateCalendarEvent();

  const members = useMemo(() => {
    const map = new Map<string, CompanyMember>(memberList.map(m => [m.user_id, m]));
    if (demo) DEMO_AVATAR_IDS.forEach((id, i) => map.set(id, { user_id: id, full_name: ['Ana Holm', 'Mikkel Berg', 'Sara Lind'][i], email: '', avatar_url: null }));
    return map;
  }, [memberList, demo]);

  const allItems = useMemo<CalendarItem[]>(() => {
    if (demo) {
      const anchor = view === 'month' ? startOfWeek(selected, { weekStartsOn: 1 }) : selected;
      return [...demoEvents(anchor), ...demoAdded].map(i => ({ ...i, ...demoEdits[i.id] }));
    }
    return [
      ...(rows ?? []).map(r => fromEventRow(r, profile?.user_id)),
      ...(tasks ?? []).filter(x => x.status !== 'completed').map(fromTask).filter((x): x is CalendarItem => !!x),
      ...(external?.events ?? []).map(fromExternal),
    ];
  }, [demo, demoAdded, demoEdits, rows, tasks, external, profile?.user_id, selected, view]);

  const items = useMemo(
    () => allItems.filter(i => sources.has(i.source) && (!i.category || categories.has(i.category))),
    [allItems, sources, categories],
  );

  // ── Formatting ─────────────────────────────────────────────────────────
  const en = locale === 'en';
  const hourLabel = useCallback((h: number) => {
    const d = new Date(2000, 0, 1, h);
    return en ? format(d, 'h a').toLowerCase() : format(d, 'HH:mm');
  }, [en]);
  const timeRange = useCallback((s: Date, e: Date) => (en ? `${format(s, 'h:mm')} - ${format(e, 'h:mm')}` : `${format(s, 'HH:mm')} - ${format(e, 'HH:mm')}`), [en]);
  const popoverTime = (s: Date, e: Date) => (en ? `${format(s, 'h:mm')} - ${format(e, 'h:mm a').toLowerCase()}` : timeRange(s, e));
  const popoverDate = (d: Date) => format(d, en ? 'MMM d, yyyy' : 'd. MMM yyyy', { locale: dfLocale });

  // ── Navigation ─────────────────────────────────────────────────────────
  const go = (step: number) => {
    setDirection(step);
    setPopover(null);
    setSelected(s => (view === 'month' ? startOfMonth(addMonths(s, step)) : addDays(s, step * (view === 'week' ? 7 : 1))));
  };
  const goTo = (d: Date) => {
    const target = startOfDay(d);
    setDirection(target > selected ? 1 : target < selected ? -1 : 0);
    setPopover(null);
    setSelected(target);
  };

  // ── Popover / editing ──────────────────────────────────────────────────
  const openItem = useCallback((item: CalendarItem, el: HTMLElement) => {
    setPopover({ item, anchor: el.getBoundingClientRect() });
  }, []);

  const closePopover = useCallback(() => setPopover(null), []);

  const patchItem = (item: CalendarItem, patch: Partial<CalendarItem>) => {
    const next = { ...item, ...patch };
    setPopover(p => (p && p.item.id === item.id ? { ...p, item: next } : p));
    if (item.id === DRAFT_ID) {
      // A draft is created on the first real title; until then it is local.
      if (patch.title === undefined) return;
      if (!patch.title) return;
      if (demo) {
        const created = { ...next, id: `demo-new-${Date.now()}` };
        setDemoAdded(a => [...a, created]);
        setPopover(p => (p ? { ...p, item: created } : p));
        return;
      }
      setSaving({ ...next, id: `${DRAFT_ID}-saving` });
      createEvent.mutate(
        { title: next.title, start_time: next.start.toISOString(), end_time: next.end.toISOString(), event_type: next.kind, color: next.color, attendee_ids: next.attendeeIds },
        {
          onSuccess: row => setPopover(p => (p && p.item.id === DRAFT_ID ? { ...p, item: fromEventRow(row, profile?.user_id) } : p)),
          onError: () => toast.error(t('pages.calendar.saveError')),
          // The hook's onSuccess awaits the calendar refetch, so by now the row is in `items`.
          onSettled: () => setSaving(null),
        },
      );
      return;
    }
    if (demo) {
      setDemoEdits(e => ({ ...e, [item.id]: { ...e[item.id], ...patch } }));
      setDemoAdded(a => a.map(x => (x.id === item.id ? next : x)));
      return;
    }
    updateEvent.mutate(
      {
        id: item.id,
        ...(patch.title !== undefined && { title: patch.title || t('pages.calendar.noTitle') }),
        ...(patch.kind !== undefined && { event_type: patch.kind, color: patch.color }),
        ...(patch.attendeeIds !== undefined && { attendee_ids: patch.attendeeIds }),
      },
      { onError: () => toast.error(t('pages.calendar.saveError')) },
    );
  };

  const onSlotClick = (day: Date, minutes: number) => {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
    const draft: CalendarItem = {
      id: DRAFT_ID, title: '', start, end: new Date(start.getTime() + 60 * 60000), color: KIND_COLOR.appointment,
      source: 'events', kind: 'appointment', category: null, attendeeIds: [], allDay: false, editable: true,
    };
    // Anchor the popover to the slot that was clicked.
    const col = document.querySelector<HTMLElement>(`[data-day="${day.toDateString()}"]`);
    const rect = col?.getBoundingClientRect();
    const top = rect ? rect.top + (minutes / 60) * 76 : window.innerHeight / 3;
    setPopover({ item: draft, anchor: new DOMRect(rect?.left ?? 0, top, rect?.width ?? 0, 38) });
  };

  // Show the draft while its popover is open, and while it is being saved.
  const gridItems = [
    ...items,
    ...(popover?.item.id === DRAFT_ID ? [popover.item] : []),
    ...(saving && popover?.item.id !== DRAFT_ID ? [saving] : []),
  ];

  // ── Join: open the event in progress, or the next one today ────────────
  const joinTarget = useMemo(() => {
    const now = Date.now();
    const todays: CalendarItem[] = demo
      ? [...demoEvents(startOfDay(today)), ...demoAdded].map(i => ({ ...i, ...demoEdits[i.id] }))
      : [...(todayRows ?? []).map(r => fromEventRow(r, profile?.user_id)), ...(todayExternal?.events ?? []).map(fromExternal)];
    return todays
      .filter(i => sources.has(i.source) && (!i.category || categories.has(i.category)))
      .filter(i => !i.allDay && isSameDay(i.start, today) && i.end.getTime() > now)
      .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  }, [demo, demoAdded, demoEdits, todayRows, todayExternal, profile?.user_id, sources, categories, today]);

  const join = () => {
    if (!joinTarget) return;
    if (view === 'month') setView('week');
    if (view === 'month' || !days.some(d => isSameDay(d, today))) goTo(today);
    setPendingJoin(joinTarget.id);
  };
  // The target may only mount after a view/week transition (AnimatePresence
  // waits for the exit), so look for it each frame for up to ~1s, scroll the
  // grid to it, then open its popover once it has settled in place.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (!pendingJoin) return;
    let raf = 0;
    let frames = 0;
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-event-id="${pendingJoin}"]`);
      const item = itemsRef.current.find(i => i.id === pendingJoin);
      if (el && item) {
        const scroller = el.closest<HTMLElement>('.overflow-y-auto');
        if (scroller) scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 60;
        raf = requestAnimationFrame(() => { openItem(item, el); setPendingJoin(null); });
        return;
      }
      if (++frames > 60) { setPendingJoin(null); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pendingJoin, openItem]);

  // ── Geometry ───────────────────────────────────────────────────────────
  const available = Math.max(0, area.width);
  const colWidth = view === 'day' ? Math.max(200, available - GUTTER - PANEL_PAD_RIGHT) : weekColumnWidth(available);
  const navKey = `${view}-${view === 'month' ? format(selected, 'yyyy-MM') : selected.toDateString()}`;
  const slide = reduce ? 0 : 40;

  const toggle = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    return next;
  };

  const sidebar = (
    <CalendarSidebar
      selected={selected}
      onSelect={d => { goTo(d); setSidebarOpen(false); }}
      locale={dfLocale}
      t={t}
      sources={sources}
      onToggleSource={s => setSources(prev => toggle(prev, s))}
      categories={categories}
      onToggleCategory={c => setCategories(prev => toggle(prev, c))}
    />
  );

  return (
    <div
      ref={fill.ref}
      className="relative -mx-4 -my-6 flex gap-[10px] bg-cal-app-bg p-2 font-cal sm:-mx-8 sm:-my-8"
      style={{ height: fill.height, fontFeatureSettings: '"tnum"' }}
    >
      {/* One instance at a time, so the mini calendar's shared layoutIds never span two copies. */}
      {isDesktop && <div className="flex">{sidebar}</div>}

      <AnimatePresence>
        {!isDesktop && sidebarOpen && (
          <>
            <motion.button
              type="button"
              aria-label={t('pages.calendar.close')}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-30 bg-black/50 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: reduce ? 0 : -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: reduce ? 0 : -24, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-2 left-2 top-2 z-40 flex lg:hidden"
            >
              {sidebar}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <motion.section
        initial={{ opacity: 0, scale: reduce ? 1 : 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[32px] pt-[22px]"
        style={{ background: 'var(--cal-panel-gradient)', paddingLeft: PANEL_PAD_LEFT }}
      >
        {/* Row 1 */}
        <div className="flex h-11 shrink-0 items-center" style={{ paddingRight: PANEL_PAD_RIGHT }}>
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label={t('pages.calendar.toggleSidebar')}
            className="mr-3 grid h-9 w-9 place-items-center rounded-[12px] bg-[#0A0A0A] text-white lg:hidden"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <h1 className="text-[26px] font-bold capitalize tracking-[-0.02em] text-[#0A0A0A]">
            {format(selected, 'MMMM yyyy', { locale: dfLocale })}
          </h1>
          <button type="button" onClick={() => goTo(today)} className="ml-3 rounded-full bg-[#0A0A0A] px-3 py-[5px] text-[12px] font-semibold text-white">
            {t('pages.calendar.today')}
          </button>
          <div className="ml-3 flex items-center gap-[10px] text-[#0A0A0A]">
            <button type="button" onClick={() => go(-1)} aria-label={t('pages.calendar.previousWeek')} className="hover:opacity-60">
              <ChevronLeft className="h-[18px] w-[18px]" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label={t('pages.calendar.nextWeek')} className="hover:opacity-60">
              <ChevronRight className="h-[18px] w-[18px]" />
            </button>
          </div>
          <button
            type="button"
            onClick={join}
            disabled={!joinTarget}
            title={joinTarget ? joinTarget.title : t('pages.calendar.joinNone')}
            className="ml-auto h-10 w-[76px] rounded-[12px] bg-[#0A0A0A] text-[14px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {t('pages.calendar.join')}
          </button>
        </div>

        {/* Row 2 */}
        <div className="mt-2 flex shrink-0 justify-end" style={{ paddingRight: PANEL_PAD_RIGHT }}>
          <ViewSwitcher view={view} onChange={v => { setPopover(null); setView(v); }} t={t} />
        </div>

        {/* Row 3 + grid */}
        <div ref={area.ref} className="mt-[10px] flex min-h-0 flex-1 overflow-x-auto lg:overflow-x-hidden">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={navKey}
              custom={direction}
              variants={{
                enter: (d: number) => ({ x: d * slide, opacity: 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d: number) => ({ x: -d * slide, opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className={cn('flex min-h-0 flex-1 flex-col', view === 'month' && 'pr-[18px]')}
            >
              {view === 'month' ? (
                <MonthGrid
                  month={selected}
                  today={today}
                  items={items}
                  locale={dfLocale}
                  onDayClick={d => { goTo(d); setView('day'); }}
                  onEventClick={openItem}
                />
              ) : (
                <>
                  <DayHeaderStrip days={days} colWidth={colWidth} locale={dfLocale} today={today} />
                  <div className="mt-[6px] flex min-h-0 flex-1">
                    <TimeGrid
                      ref={gridRef}
                      days={days}
                      colWidth={colWidth}
                      items={gridItems}
                      members={members}
                      locale={dfLocale}
                      hourLabel={hourLabel}
                      timeRange={timeRange}
                      initialScrollTop={gridScroll.current}
                      onScroll={top => { gridScroll.current = top; }}
                      onSlotClick={onSlotClick}
                      onEventClick={openItem}
                    />
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.section>

      {popover && (
        <EventPopover
          item={popover.item}
          anchor={popover.anchor}
          members={memberList}
          memberMap={members}
          dateLabel={popoverDate(popover.item.start)}
          timeLabel={popover.item.allDay ? '' : popoverTime(popover.item.start, popover.item.end)}
          t={t}
          onClose={closePopover}
          onTitleCommit={title => patchItem(popover.item, { title })}
          onKindChange={kind => patchItem(popover.item, { kind, color: KIND_COLOR[kind] })}
          onAttendeesChange={attendeeIds => patchItem(popover.item, { attendeeIds })}
        />
      )}
    </div>
  );
}
