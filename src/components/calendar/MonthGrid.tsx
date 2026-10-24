import { addDays, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, type Locale } from 'date-fns';
import { cn } from '@/lib/utils';
import { EVENT_COLORS, type CalendarItem } from './model';

interface Props {
  month: Date;
  today: Date;
  items: CalendarItem[];
  locale: Locale;
  onDayClick: (day: Date) => void;
  onEventClick: (item: CalendarItem, el: HTMLElement) => void;
}

/** Month view in the same visual language as the week grid. */
export function MonthGrid({ month, today, items, locale, onDayClick, onEventClick }: Props) {
  const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[28px] bg-cal-grid-bg p-3">
      <div className="grid grid-cols-7 gap-2 px-1 pb-2 text-[13px] lowercase text-cal-hour-label">
        {days.slice(0, 7).map(d => <span key={d.toISOString()} className="px-2">{format(d, 'EEE', { locale }).replace('.', '')}</span>)}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-2">
        {days.map(day => {
          const dayItems = items.filter(i => isSameDay(i.start, day));
          const isToday = isSameDay(day, today);
          return (
            <div
              key={day.toISOString()}
              role="button"
              tabIndex={0}
              onClick={() => onDayClick(day)}
              onKeyDown={e => { if (e.key === 'Enter') onDayClick(day); }}
              className={cn(
                'flex min-h-0 cursor-pointer flex-col gap-1 overflow-hidden rounded-[14px] border border-cal-grid-line p-2 transition-colors hover:bg-[#F7F7F9]',
                !isSameMonth(day, month) && 'opacity-45',
              )}
            >
              <span className={cn('text-[15px] font-bold tabular-nums', isToday ? 'text-cal-purple' : 'text-[#111]')}>{format(day, 'd')}</span>
              {dayItems.slice(0, 3).map(i => (
                <button
                  key={i.id}
                  type="button"
                  onClick={e => { e.stopPropagation(); onEventClick(i, e.currentTarget); }}
                  className="truncate rounded-[8px] px-2 py-[2px] text-left text-[11px] font-medium"
                  style={{ background: EVENT_COLORS[i.color].bg, color: EVENT_COLORS[i.color].title }}
                >
                  {i.title}
                </button>
              ))}
              {dayItems.length > 3 && <span className="px-1 text-[11px] text-cal-hour-label">+{dayItems.length - 3}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
