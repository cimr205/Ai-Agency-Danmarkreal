import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CalendarOff } from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isSameDay, addMonths, subMonths,
} from 'date-fns';
import { da, enUS, de } from 'date-fns/locale';
import { useI18n } from '@/lib/i18n';
import type { DealWithCustomer } from '@/hooks/api/useDeals';
import { normalizeStageKey } from '@/lib/deals/stages';

const DATE_LOCALES: Record<string, typeof da> = { da, en: enUS, de };
const STAGE_DOT: Record<string, string> = {
  discovery: '#3B82F6', proposal: '#F59E0B', negotiation: '#8B5CF6', won: '#22C55E', lost: '#EF4444',
};

export function DealCalendarView({
  deals, onSelectDeal, formatCurrency,
}: {
  deals: DealWithCustomer[];
  onSelectDeal: (deal: DealWithCustomer) => void;
  formatCurrency: (n: number) => string;
}) {
  const { t, locale } = useI18n();
  const [currentDate, setCurrentDate] = useState(new Date());
  const dateFnsLocale = DATE_LOCALES[locale] || da;

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const start = startOfWeek(monthStart, { weekStartsOn: 1 });
    const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentDate]);

  const { dealsByDay, undated } = useMemo(() => {
    const map = new Map<string, DealWithCustomer[]>();
    const noDate: DealWithCustomer[] = [];
    deals.forEach(deal => {
      if (!deal.expected_close_date) { noDate.push(deal); return; }
      const key = format(new Date(deal.expected_close_date), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(deal);
    });
    return { dealsByDay: map, undated: noDate };
  }, [deals]);

  const weekDayLabels: Record<string, string[]> = {
    en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    da: ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'],
    de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
  };
  const weekDays = weekDayLabels[locale] || weekDayLabels.da;

  const noDateLabel = locale === 'da' ? 'Ingen dato' : locale === 'de' ? 'Kein Datum' : 'No date';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-lg font-semibold min-w-[200px] text-center">
          {format(currentDate, 'MMMM yyyy', { locale: dateFnsLocale })}
        </h3>
        <Button variant="outline" size="icon" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {undated.length > 0 && (
        <div className="rounded-xl border border-dashed border-border p-3">
          <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
            <CalendarOff className="h-3.5 w-3.5" /> {noDateLabel} ({undated.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {undated.map(deal => (
              <button
                key={deal.id}
                onClick={() => onSelectDeal(deal)}
                className="text-[11px] px-2 py-1 rounded-md bg-muted hover:bg-muted/70 transition-colors truncate max-w-[180px]"
              >
                {deal.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden">
        {weekDays.map(day => (
          <div key={day} className="bg-muted/50 text-center text-xs font-medium text-muted-foreground py-2">
            {day}
          </div>
        ))}
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const dayDeals = dealsByDay.get(key) || [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, new Date());

          return (
            <div key={key} className={`bg-card min-h-[100px] p-1.5 ${!isCurrentMonth ? 'opacity-40' : ''}`}>
              <div
                className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayDeals.slice(0, 3).map(deal => {
                  const color = STAGE_DOT[normalizeStageKey(deal.stage)] || '#64748B';
                  return (
                    <div
                      key={deal.id}
                      className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer truncate hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: color + '22', color, borderLeft: `2px solid ${color}` }}
                      onClick={() => onSelectDeal(deal)}
                      title={`${deal.title} — ${formatCurrency(Number(deal.value || 0))}`}
                    >
                      {deal.title}
                    </div>
                  );
                })}
                {dayDeals.length > 3 && (
                  <div className="text-[10px] text-muted-foreground pl-1">
                    +{dayDeals.length - 3} {t('pipeline.more')}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
