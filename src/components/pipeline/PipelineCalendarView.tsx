import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PIPELINE_STAGES, getStageLabel, type PipelineLead } from '@/lib/pipeline';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval,
  format, isSameMonth, isSameDay, addMonths, subMonths, addWeeks, subWeeks,
  startOfDay,
} from 'date-fns';
import { da, enUS, de } from 'date-fns/locale';
import { useI18n } from '@/lib/i18n';

type ViewMode = 'month' | 'week';
const DATE_LOCALES: Record<string, typeof da> = { da, en: enUS, de };

interface Props {
  leads: PipelineLead[];
  onSelectLead: (lead: PipelineLead) => void;
}

export default function PipelineCalendarView({ leads, onSelectLead }: Props) {
  const { t, locale } = useI18n();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const dateFnsLocale = DATE_LOCALES[locale] || da;

  const days = useMemo(() => {
    if (viewMode === 'month') {
      const monthStart = startOfMonth(currentDate);
      const monthEnd = endOfMonth(currentDate);
      const start = startOfWeek(monthStart, { weekStartsOn: 1 });
      const end = endOfWeek(monthEnd, { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    } else {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      return eachDayOfInterval({ start: weekStart, end: weekEnd });
    }
  }, [currentDate, viewMode]);

  const leadsByDay = useMemo(() => {
    const map = new Map<string, PipelineLead[]>();
    leads.forEach(lead => {
      const dateStr = lead.next_followup_at || lead.last_touched_at;
      if (!dateStr) return;
      const key = format(startOfDay(new Date(dateStr)), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(lead);
    });
    return map;
  }, [leads]);

  const navigate = (dir: 'prev' | 'next') => {
    if (viewMode === 'month') {
      setCurrentDate(dir === 'prev' ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
    } else {
      setCurrentDate(dir === 'prev' ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
    }
  };

  const weekDayLabels: Record<string, string[]> = {
    en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    da: ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'],
    de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
  };
  const weekDays = weekDayLabels[locale] || weekDayLabels.da;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-lg font-semibold min-w-[200px] text-center">
            {viewMode === 'month'
              ? format(currentDate, 'MMMM yyyy', { locale: dateFnsLocale })
              : `${t('pipeline.week')} ${format(currentDate, 'w', { locale: dateFnsLocale })}, ${format(currentDate, 'yyyy')}`}
          </h3>
          <Button variant="outline" size="icon" onClick={() => navigate('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <Button size="sm" variant={viewMode === 'month' ? 'default' : 'ghost'} onClick={() => setViewMode('month')}>
            {t('pipeline.monthView')}
          </Button>
          <Button size="sm" variant={viewMode === 'week' ? 'default' : 'ghost'} onClick={() => setViewMode('week')}>
            {t('pipeline.weekView')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden">
        {weekDays.map(day => (
          <div key={day} className="bg-muted/50 text-center text-xs font-medium text-muted-foreground py-2">
            {day}
          </div>
        ))}
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const dayLeads = leadsByDay.get(key) || [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={key}
              className={`bg-card min-h-[100px] p-1.5 ${viewMode === 'week' ? 'min-h-[200px]' : ''} ${!isCurrentMonth ? 'opacity-40' : ''}`}
            >
              <div
                className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                }`}
              >
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayLeads.slice(0, viewMode === 'week' ? 10 : 3).map(lead => {
                  const stageInfo = PIPELINE_STAGES.find(s => s.key === lead.status);
                  return (
                    <div
                      key={lead.id}
                      className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer truncate hover:opacity-80 transition-opacity"
                      style={{ backgroundColor: stageInfo?.color + '22', color: stageInfo?.color, borderLeft: `2px solid ${stageInfo?.color}` }}
                      onClick={() => onSelectLead(lead)}
                    >
                      {lead.name}
                    </div>
                  );
                })}
                {dayLeads.length > (viewMode === 'week' ? 10 : 3) && (
                  <div className="text-[10px] text-muted-foreground pl-1">
                    +{dayLeads.length - (viewMode === 'week' ? 10 : 3)} {t('pipeline.more')}
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
