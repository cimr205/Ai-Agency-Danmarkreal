import { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, type Locale } from 'date-fns';
import { cn } from '@/lib/utils';

interface Props {
  selected: Date;
  onSelect: (d: Date) => void;
  locale: Locale;
  labels: { previous: string; next: string };
}

const GLIDE = { type: 'spring', stiffness: 400, damping: 32 } as const;

/** Card A: month grid with the current week highlighted and a lime selected day. */
export function MiniCalendar({ selected, onSelect, locale, labels }: Props) {
  const [month, setMonth] = useState(() => startOfMonth(selected));
  const [shownFor, setShownFor] = useState(selected);
  const reduce = useReducedMotion();
  // Follow the selection when it moves to another month (week nav, Today).
  if (!isSameDay(shownFor, selected)) {
    setShownFor(selected);
    if (!isSameMonth(month, selected)) setMonth(startOfMonth(selected));
  }

  const weeks = useMemo(() => {
    const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
  }, [month]);
  const weekdays = weeks[0].map(d => format(d, 'EEEEEE', { locale }));
  const transition = reduce ? { duration: 0 } : GLIDE;

  return (
    <div className="rounded-[18px] bg-cal-sidebar-card p-[18px]">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-semibold capitalize text-cal-sidebar-text">{format(month, 'MMMM yyyy', { locale })}</h2>
        <div className="flex items-center gap-[14px] text-cal-sidebar-text">
          <button type="button" aria-label={labels.previous} onClick={() => setMonth(m => addMonths(m, -1))} className="rounded hover:opacity-70">
            <ChevronLeft className="h-[18px] w-[18px]" />
          </button>
          <button type="button" aria-label={labels.next} onClick={() => setMonth(m => addMonths(m, 1))} className="rounded hover:opacity-70">
            <ChevronRight className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      <div className="mt-[18px] grid grid-cols-7 text-center text-[12px] font-medium capitalize text-cal-sidebar-label">
        {weekdays.map(w => <span key={w}>{w}</span>)}
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {weeks.map(week => {
          const isSelectedWeek = week.some(d => isSameDay(d, selected));
          return (
            <div key={week[0].toISOString()} className="relative grid grid-cols-7">
              {isSelectedWeek && (
                <motion.div
                  layoutId="miniWeek"
                  transition={transition}
                  className="absolute -inset-x-1 inset-y-0 bg-cal-sidebar-card-row"
                  style={{ borderRadius: 999 }}
                />
              )}
              {week.map(day => {
                const isSelected = isSameDay(day, selected);
                const outside = !isSameMonth(day, month);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => onSelect(day)}
                    aria-pressed={isSelected}
                    aria-label={format(day, 'PPPP', { locale })}
                    className={cn(
                      'group relative mx-auto grid h-[30px] w-[30px] place-items-center text-[13px] tabular-nums',
                      outside ? 'text-cal-sidebar-muted' : 'text-cal-sidebar-text',
                    )}
                  >
                    {isSelected ? (
                      <motion.span
                        layoutId="miniSelected"
                        transition={transition}
                        className="absolute h-[26px] w-[26px] bg-cal-lime"
                        style={{ borderRadius: 999 }}
                      />
                    ) : (
                      <span className="absolute h-[26px] w-[26px] rounded-full bg-cal-sidebar-card-row opacity-0 transition-opacity group-hover:opacity-100" />
                    )}
                    <span className={cn('relative', isSelected && 'font-semibold text-black')}>{format(day, 'd')}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
