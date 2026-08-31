import { useState } from 'react';
import { useMyCalendar, useCreateCalendarEvent } from '@/hooks/api/useCalendar';
import { useTasks } from '@/hooks/api/useTasks';
import { useModuleAvailability, useExternalCalendarEvents } from '@/hooks/api/useIntegrations';
import { Link } from 'react-router-dom';
import { Plug } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Calendar, Clock, ChevronLeft, ChevronRight, CheckSquare } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths } from 'date-fns';
import { da, de, enUS } from 'date-fns/locale';
import { useI18n, isLocale } from '@/lib/i18n';
import { useParams } from 'react-router-dom';

const localeMap = { da, de, en: enUS };

export default function CalendarPage() {
  const { t } = useI18n();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const dateFnsLocale = localeMap[locale] || enUS;

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({ title: '', description: '', start_time: '', end_time: '' });

  const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  const { data: events, isLoading, error } = useMyCalendar({ start, end });
  const { data: tasks } = useTasks();
  const createEvent = useCreateCalendarEvent();

  // Real events from a connected external calendar (Google Calendar /
  // Outlook), surfaced straight into the same grid — the Capability Engine
  // in action: this page never checks "is Google Calendar connected?", it
  // just asks "is calendar.read available?" via useModuleAvailability.
  const { data: availability } = useModuleAvailability();
  const calendarModule = availability?.modules.find((m) => m.module === 'calendar');
  const hasExternalCalendar = !!calendarModule?.available;
  const { data: externalData } = useExternalCalendarEvents(
    startOfMonth(currentMonth).toISOString(),
    endOfMonth(currentMonth).toISOString(),
    hasExternalCalendar,
  );
  const externalEvents = (externalData?.events ?? []).map(e => ({
    id: `ext-${e.id}`, title: e.title, start_time: e.startTime, isExternal: true, isTask: false,
  }));

  // Tasks with due dates as calendar items
  const taskEvents = (tasks || [])
    .filter(t => t.due_date && t.status !== 'completed')
    .map(t => ({ id: `task-${t.id}`, title: `📋 ${t.title}`, start_time: t.due_date!, isTask: true, isExternal: false, priority: t.priority }));

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });

  const dayNames = [
    t('pages.calendar.days.mon'), t('pages.calendar.days.tue'), t('pages.calendar.days.wed'),
    t('pages.calendar.days.thu'), t('pages.calendar.days.fri'), t('pages.calendar.days.sat'), t('pages.calendar.days.sun'),
  ];

  const handleCreate = async () => {
    if (!newEvent.title || !newEvent.start_time || !newEvent.end_time) {
      toast.error(t('pages.calendar.required')); return;
    }
    try {
      await createEvent.mutateAsync(newEvent);
      toast.success(t('pages.calendar.created_success'));
      setNewEvent({ title: '', description: '', start_time: '', end_time: '' });
      setIsCreateOpen(false);
    } catch { toast.error(t('pages.calendar.created_error')); }
  };

  const getEventsForDay = (day: Date) => {
    const calEvents = events?.filter(event => isSameDay(new Date(event.start_time), day)) ?? [];
    const extEvents = externalEvents.filter(e => isSameDay(new Date(e.start_time), day));
    const dayTasks = taskEvents.filter(t => isSameDay(new Date(t.start_time), day));
    return [...calEvents.map(e => ({ ...e, isTask: false, isExternal: false })), ...extEvents, ...dayTasks];
  };
  const upcomingEvents = [...(events ?? []).map(e => ({ ...e, isExternal: false })), ...externalEvents]
    .filter(event => new Date(event.start_time) >= new Date())
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, 5);
  const upcomingTasks = taskEvents.filter(t => new Date(t.start_time) >= new Date()).slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pages.calendar.title')}</h1>
          <p className="text-muted-foreground">{t('pages.calendar.subtitle')}</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t('pages.calendar.newEvent')}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('pages.calendar.createTitle')}</DialogTitle>
              <DialogDescription>{t('pages.calendar.createSubtitle')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label htmlFor="title">{t('pages.calendar.titleLabel')} *</Label><Input id="title" value={newEvent.title} onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })} placeholder={t('pages.calendar.titlePlaceholder')} /></div>
              <div className="space-y-2"><Label htmlFor="description">{t('pages.calendar.descriptionLabel')}</Label><Input id="description" value={newEvent.description} onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })} placeholder={t('pages.calendar.descriptionPlaceholder')} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="start_time">{t('pages.calendar.start')} *</Label><Input id="start_time" type="datetime-local" value={newEvent.start_time} onChange={(e) => setNewEvent({ ...newEvent, start_time: e.target.value })} /></div>
                <div className="space-y-2"><Label htmlFor="end_time">{t('pages.calendar.end')} *</Label><Input id="end_time" type="datetime-local" value={newEvent.end_time} onChange={(e) => setNewEvent({ ...newEvent, end_time: e.target.value })} /></div>
              </div>
              <Button onClick={handleCreate} disabled={createEvent.isPending} className="w-full">{createEvent.isPending ? t('pages.calendar.creating') : t('pages.calendar.createCta')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="capitalize">{format(currentMonth, 'MMMM yyyy', { locale: dateFnsLocale })}</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 mb-2">
              {dayNames.map((day) => (<div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">{day}</div>))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: (days[0].getDay() + 6) % 7 }).map((_, i) => (<div key={`empty-${i}`} className="aspect-square" />))}
              {days.map((day) => {
                const dayEvents = getEventsForDay(day);
                return (
                  <div key={day.toISOString()} className={`aspect-square p-1 border rounded-md ${isToday(day) ? 'bg-primary/10 border-primary' : 'border-transparent hover:bg-muted'}`}>
                    <div className={`text-sm ${isToday(day) ? 'font-bold text-primary' : ''}`}>{format(day, 'd')}</div>
                    {dayEvents.length > 0 && (
                      <div className="mt-1">
                        {dayEvents.slice(0, 2).map((event) => (
                          <div
                            key={event.id}
                            className={`text-xs rounded px-1 truncate mb-0.5 ${
                              event.isTask ? 'bg-warning/20 text-warning'
                              : event.isExternal ? 'bg-sky-500/20 text-sky-600'
                              : 'bg-primary/20 text-primary'
                            }`}
                          >
                            {event.title}
                          </div>
                        ))}
                        {dayEvents.length > 2 && <div className="text-xs text-muted-foreground">+{dayEvents.length - 2} {t('pages.calendar.more')}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">{t('pages.calendar.upcoming')}</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">{Array.from({ length: 3 }).map((_, i) => (<div key={i} className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div>))}</div>
            ) : error ? (
              <p className="text-muted-foreground text-sm">{t('pages.calendar.fetchError')}</p>
            ) : upcomingEvents.length === 0 ? (
              <EmptyState bare icon={Calendar} title={t('pages.calendar.empty')} action={{ label: t('pages.calendar.newEvent'), onClick: () => setIsCreateOpen(true), icon: Plus }} />
            ) : (
              <div className="space-y-4">
                {upcomingEvents.map((event) => (
                  <div key={event.id} className={`border-l-2 pl-3 ${event.isExternal ? 'border-sky-500' : 'border-primary'}`}>
                    <p className="font-medium">{event.title}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />{format(new Date(event.start_time), 'dd MMM', { locale: dateFnsLocale })}
                      <Clock className="h-3 w-3 ml-2" />{format(new Date(event.start_time), 'HH:mm')}
                      {event.isExternal && <span className="ml-2 text-sky-600">· {calendarModule?.resolvedConnections[0]?.provider}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!hasExternalCalendar && (
              <Link
                to={`/${locale}/app/workspace/connected-apps`}
                className="mt-4 flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground border-t border-border pt-4"
              >
                <Plug className="h-3.5 w-3.5" /> Forbind Google Calendar eller Outlook for at se eksterne møder her
              </Link>
            )}
            {/* Upcoming tasks */}
            {upcomingTasks.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
                  <CheckSquare className="h-3 w-3" /> {t('pages.tasks.title')}
                </p>
                {upcomingTasks.map((task) => (
                  <div key={task.id} className="border-l-2 border-warning pl-3">
                    <p className="font-medium text-sm">{task.title.replace('📋 ', '')}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />{format(new Date(task.start_time), 'dd MMM', { locale: dateFnsLocale })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}