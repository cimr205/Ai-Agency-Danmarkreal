import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react';
import { format, isSameDay, type Locale } from 'date-fns';
import { HOUR_HEIGHT, layoutDay, minutesFromOffset } from '@/lib/calendar/layout';
import type { CompanyMember } from '@/hooks/api/useCalendar';
import { EventCard } from './EventCard';
import { EVENT_COLORS, type CalendarItem } from './model';
import { COL_GAP, GUTTER, columnLeft } from './geometry';

export interface TimeGridHandle {
  /** Scrolls so `minutes` after midnight is near the top. */
  scrollToMinutes: (minutes: number) => void;
}

interface Props {
  days: Date[];
  colWidth: number;
  items: CalendarItem[];
  members: Map<string, CompanyMember>;
  locale: Locale;
  hourLabel: (hour: number) => string;
  timeRange: (start: Date, end: Date) => string;
  /** Restores the previous scroll position after week navigation. */
  initialScrollTop?: number | null;
  onScroll?: (top: number) => void;
  onSlotClick: (day: Date, minutes: number) => void;
  onEventClick: (item: CalendarItem, el: HTMLElement) => void;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const TOP_PAD = 20;

export const TimeGrid = forwardRef<TimeGridHandle, Props>(function TimeGrid(
  { days, colWidth, items, members, locale, hourLabel, timeRange, initialScrollTop, onScroll, onSlotClick, onEventClick },
  ref,
) {
  const scroller = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({
    scrollToMinutes: (minutes: number) => {
      scroller.current?.scrollTo({ top: Math.max(0, (minutes / 60) * HOUR_HEIGHT - TOP_PAD) });
    },
  }));
  // Open at 8 am, like the reference; keep the user's position across weeks.
  // Applied once the scroller is actually height-constrained: the page sizes
  // itself after mount, and before that the grid is as tall as its content.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = initialScrollTop ?? 8 * HOUR_HEIGHT - TOP_PAD;
    const apply = () => {
      if (el.clientHeight === 0 || el.scrollHeight <= el.clientHeight) return false;
      el.scrollTop = target;
      return true;
    };
    if (apply()) return;
    const ro = new ResizeObserver(() => { if (apply()) ro.disconnect(); });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  const timed = useMemo(() => items.filter(i => !i.allDay), [items]);
  const allDay = useMemo(() => items.filter(i => i.allDay), [items]);
  const width = columnLeft(days.length, colWidth) - COL_GAP;
  let cardIndex = 0;

  return (
    <div ref={scroller} onScroll={e => onScroll?.(e.currentTarget.scrollTop)} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-t-[28px] bg-cal-grid-bg" style={{ width }}>
      {allDay.length > 0 && (
        <div className="sticky top-0 z-20 flex gap-2 border-b border-cal-grid-line bg-cal-grid-bg/95 py-1.5 backdrop-blur" style={{ paddingLeft: GUTTER }}>
          {days.map(day => (
            <div key={day.toISOString()} className="flex shrink-0 flex-col gap-1" style={{ width: colWidth }}>
              {allDay.filter(i => isSameDay(i.start, day)).slice(0, 3).map(i => (
                <button
                  key={i.id}
                  type="button"
                  onClick={e => onEventClick(i, e.currentTarget)}
                  className="truncate rounded-[8px] px-2 py-[3px] text-left text-[11px] font-medium"
                  style={{ background: EVENT_COLORS[i.color].bg, color: EVENT_COLORS[i.color].title }}
                >
                  {i.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="relative" style={{ height: 24 * HOUR_HEIGHT + TOP_PAD * 2 }}>
        {HOURS.map(h => (
          <div key={h} className="pointer-events-none absolute left-0 right-0" style={{ top: TOP_PAD + h * HOUR_HEIGHT }}>
            {h > 0 && (
              <span className="absolute left-[10px] -translate-y-1/2 text-[13px] tabular-nums text-cal-hour-label" style={{ top: 0 }}>
                {hourLabel(h)}
              </span>
            )}
            <div className="absolute right-0 h-px bg-cal-grid-line" style={{ left: GUTTER }} />
          </div>
        ))}

        {days.map((day, col) => {
          const left = columnLeft(col, colWidth);
          const positioned = layoutDay(day, timed);
          return (
            <div
              key={day.toISOString()}
              role="presentation"
              data-day={day.toDateString()}
              className="absolute bottom-0 cursor-cell"
              style={{ left, width: colWidth, top: TOP_PAD, height: 24 * HOUR_HEIGHT }}
              onClick={e => {
                const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
                onSlotClick(day, minutesFromOffset(y));
              }}
            >
              {positioned.map(p => {
                const laneWidth = colWidth / p.lanes;
                return (
                  <EventCard
                    key={p.item.id}
                    index={cardIndex++}
                    item={p.item}
                    members={members}
                    timeLabel={timeRange(p.item.start, p.item.end)}
                    onOpen={onEventClick}
                    style={{ top: p.top + 2, height: p.height - 4, left: p.lane * laneWidth + 2, width: laneWidth - 4 }}
                  />
                );
              })}
            </div>
          );
        })}
        <span className="sr-only">{format(days[0] ?? new Date(), 'PPPP', { locale })}</span>
      </div>
    </div>
  );
});
