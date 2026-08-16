import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useWorkSchedules, useCreateSchedule, useDeleteSchedule, type WorkSchedule } from '@/hooks/api/useWorkforce';
import { useEmployees } from '@/hooks/api/useEmployees';
import { CalendarDays, Plus, Trash2, List, Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import { format, addDays, startOfWeek, endOfWeek, addWeeks, isSameDay, parseISO } from 'date-fns';

export default function WorkSchedulePage() {
  const { t } = useI18n();
  const [view, setView] = useState<'week' | 'list'>('week');
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [dialogOpen, setDialogOpen] = useState(false);

  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });
  const { data: schedules, isLoading } = useWorkSchedules({
    startDate: format(currentWeekStart, 'yyyy-MM-dd'),
    endDate: format(weekEnd, 'yyyy-MM-dd'),
  });
  const { data: employees } = useEmployees();
  const createSchedule = useCreateSchedule();
  const deleteSchedule = useDeleteSchedule();

  // Form state
  const [form, setForm] = useState({
    employee_profile_id: '',
    schedule_date: format(new Date(), 'yyyy-MM-dd'),
    start_time: '09:00',
    end_time: '17:00',
    title: '',
    break_minutes: 30,
    notes: '',
  });

  const handleCreate = async () => {
    if (!form.employee_profile_id || !form.schedule_date) { toast.error(t('workforce.fillRequired')); return; }
    try {
      await createSchedule.mutateAsync({
        employee_profile_id: form.employee_profile_id,
        schedule_date: form.schedule_date,
        start_time: `${form.schedule_date}T${form.start_time}:00`,
        end_time: `${form.schedule_date}T${form.end_time}:00`,
        title: form.title || undefined,
        break_minutes: form.break_minutes,
        notes: form.notes || undefined,
      });
      toast.success(t('workforce.scheduleCreated'));
      setDialogOpen(false);
      setForm({ employee_profile_id: '', schedule_date: format(new Date(), 'yyyy-MM-dd'), start_time: '09:00', end_time: '17:00', title: '', break_minutes: 30, notes: '' });
    } catch { toast.error(t('workforce.scheduleCreateFailed')); }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSchedule.mutateAsync(id);
      toast.success(t('common.deleted'));
    } catch { toast.error(t('common.error')); }
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const activeEmployees = (employees ?? []).filter(e => e.is_active !== false);

  // Group schedules by employee for week view
  const schedulesByEmployee = new Map<string, { name: string; department: string; schedules: WorkSchedule[] }>();
  activeEmployees.forEach(e => {
    schedulesByEmployee.set(e.id, { name: e.full_name, department: e.department || '-', schedules: [] });
  });
  (schedules ?? []).forEach((s: WorkSchedule) => {
    const existing = schedulesByEmployee.get(s.employee_profile_id);
    if (existing) existing.schedules.push(s);
    else schedulesByEmployee.set(s.employee_profile_id, {
      name: s.employee_profiles?.full_name || '?',
      department: s.employee_profiles?.department || '-',
      schedules: [s],
    });
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('workforce.scheduleTitle')}</h1>
          <p className="text-muted-foreground">{t('workforce.scheduleSubtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-border rounded-lg overflow-hidden">
            <Button variant={view === 'week' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('week')}><Calendar className="h-4 w-4" /></Button>
            <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('list')}><List className="h-4 w-4" /></Button>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />{t('workforce.addSchedule')}</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{t('workforce.createSchedule')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-1">
                  <Label>{t('workforce.employee')}</Label>
                  <Select value={form.employee_profile_id} onValueChange={v => setForm(p => ({ ...p, employee_profile_id: v }))}>
                    <SelectTrigger><SelectValue placeholder={t('workforce.selectEmployee')} /></SelectTrigger>
                    <SelectContent>
                      {activeEmployees.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.full_name} — {e.position || e.department || e.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label>{t('workforce.date')}</Label>
                    <Input type="date" value={form.schedule_date} onChange={e => setForm(p => ({ ...p, schedule_date: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('workforce.startTime')}</Label>
                    <Input type="time" value={form.start_time} onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('workforce.endTime')}</Label>
                    <Input type="time" value={form.end_time} onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{t('workforce.shiftTitle')}</Label>
                    <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder={t('workforce.shiftTitlePlaceholder')} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('workforce.breakMinutes')}</Label>
                    <Input type="number" value={form.break_minutes} onChange={e => setForm(p => ({ ...p, break_minutes: parseInt(e.target.value) || 0 }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{t('workforce.notes')}</Label>
                  <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
                </div>
                <Button onClick={handleCreate} disabled={createSchedule.isPending} className="w-full">
                  {t('workforce.createSchedule')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, -1))}>
          <ChevronLeft className="h-4 w-4 mr-1" /> {t('workforce.prevWeek')}
        </Button>
        <h2 className="text-lg font-semibold">
          {format(currentWeekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM yyyy')}
        </h2>
        <Button variant="ghost" size="sm" onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}>
          {t('workforce.nextWeek')} <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : view === 'week' ? (
        /* ─── Week Grid View ─── */
        <Card className="border-border/50 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="text-left p-3 font-medium text-muted-foreground min-w-[160px]">{t('workforce.employee')}</th>
                    {weekDays.map(day => (
                      <th key={day.toISOString()} className={`text-center p-3 font-medium min-w-[120px] ${isSameDay(day, new Date()) ? 'text-primary bg-primary/5' : 'text-muted-foreground'}`}>
                        <div>{format(day, 'EEE')}</div>
                        <div className="text-xs">{format(day, 'dd/MM')}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from(schedulesByEmployee.entries()).map(([empId, data]) => (
                    <tr key={empId} className="border-b border-border/20 hover:bg-muted/10">
                      <td className="p-3">
                        <p className="font-medium text-sm">{data.name}</p>
                        <p className="text-xs text-muted-foreground">{data.department}</p>
                      </td>
                      {weekDays.map(day => {
                        const daySchedules = data.schedules.filter((s) => isSameDay(parseISO(s.schedule_date), day));
                        return (
                          <td key={day.toISOString()} className={`p-2 text-center align-top ${isSameDay(day, new Date()) ? 'bg-primary/5' : ''}`}>
                            {daySchedules.map((s) => (
                              <div key={s.id} className="bg-primary/10 border border-primary/20 rounded-md p-1.5 mb-1 text-xs group relative">
                                <div className="font-mono font-medium">
                                  {format(new Date(s.start_time), 'HH:mm')}–{format(new Date(s.end_time), 'HH:mm')}
                                </div>
                                {s.title && <div className="text-muted-foreground truncate">{s.title}</div>}
                                <button
                                  onClick={() => handleDelete(s.id)}
                                  className="absolute -top-1 -right-1 h-4 w-4 bg-destructive text-destructive-foreground rounded-full hidden group-hover:flex items-center justify-center text-[10px]"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {schedulesByEmployee.size === 0 && (
                    <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">{t('workforce.noSchedules')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* ─── List View ─── */
        <Card className="border-border/50">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('workforce.employee')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('workforce.date')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('workforce.time')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('workforce.breakMinutes')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">{t('workforce.shiftTitle')}</th>
                  <th className="text-left p-3 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {(schedules ?? []).length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">{t('workforce.noSchedules')}</td></tr>
                ) : (
                  (schedules ?? []).map((s: WorkSchedule) => (
                    <tr key={s.id} className="border-b border-border/20">
                      <td className="p-3 font-medium">{s.employee_profiles?.full_name}</td>
                      <td className="p-3">{format(parseISO(s.schedule_date), 'dd/MM/yyyy')}</td>
                      <td className="p-3 font-mono">{format(new Date(s.start_time), 'HH:mm')}–{format(new Date(s.end_time), 'HH:mm')}</td>
                      <td className="p-3">{s.break_minutes || 0}m</td>
                      <td className="p-3 text-muted-foreground">{s.title || '-'}</td>
                      <td className="p-3">
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(s.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
