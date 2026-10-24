import { format, isSameDay, isBefore, startOfDay, type Locale } from 'date-fns';
import { cn } from '@/lib/utils';
import { gmtLabel } from '@/lib/calendar/layout';
import { GMT_WIDTH, COL_GAP } from './geometry';

interface Props {
  days: Date[];
  colWidth: number;
  locale: Locale;
  today: Date;
}

/** Row 3: GMT cell + one glass cell per day (past lime, today white, future grey-blue). */
export function DayHeaderStrip({ days, colWidth, locale, today }: Props) {
  return (
    <div className="flex h-[62px] shrink-0" style={{ gap: COL_GAP }}>
      <div
        className="grid shrink-0 place-items-center rounded-[16px] bg-cal-gmt-cell"
        style={{ width: GMT_WIDTH }}
      >
        <span className="-rotate-90 whitespace-nowrap text-[11px] font-semibold text-[#1A1A1A]">{gmtLabel(today)}</span>
      </div>
      {days.map(day => {
        const isToday = isSameDay(day, today);
        const past = !isToday && isBefore(day, startOfDay(today));
        return (
          <div
            key={day.toISOString()}
            className={cn(
              'flex shrink-0 items-center justify-center rounded-[16px] tabular-nums',
              isToday ? 'bg-cal-day-active text-cal-purple' : past ? 'bg-cal-day-past text-[#1A1A1A]' : 'bg-cal-day-future text-[#111]',
            )}
            style={{ width: colWidth }}
          >
            <span className="flex items-baseline gap-[6px]">
              <span className="text-[16px] font-normal lowercase">{format(day, 'EEE', { locale }).replace('.', '')}</span>
              <span className="text-[32px] font-bold leading-none tracking-[-0.02em]">{format(day, 'd')}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
