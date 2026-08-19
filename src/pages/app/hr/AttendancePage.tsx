import { useState } from 'react';
import { useAttendance, useCheckIn, useCheckOut, useEmployees } from '@/hooks/api/useEmployees';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Clock, LogIn, LogOut, UserCheck } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { da, de, enUS } from 'date-fns/locale';
import { useI18n } from '@/lib/i18n';

const DATE_LOCALES = { da, de, en: enUS } as const;

export default function AttendancePage() {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const today = format(new Date(), 'yyyy-MM-dd');
  const { data, isLoading, error } = useAttendance({ date: today });
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const { data: employees } = useEmployees();

  const dateFnsLocale = DATE_LOCALES[locale] || enUS;

  const handleCheckIn = async () => {
    if (!selectedEmployee) { toast.error(t('hr.selectEmployee')); return; }
    try {
      await checkIn.mutateAsync({ employee_profile_id: selectedEmployee });
      toast.success(t('hr.checkInRegistered') || 'Check-in registered');
      setSelectedEmployee('');
    } catch { toast.error(t('hr.checkInError') || 'Check-in failed'); }
  };

  const handleCheckOut = async (attendanceId: string) => {
    try { await checkOut.mutateAsync(attendanceId); toast.success(t('hr.checkOutRegistered')); }
    catch { toast.error(t('hr.checkOutError')); }
  };

  const records = data ?? [];
  const filteredAttendance = records.filter(record =>
    (record.employee_profiles?.full_name || '').toLowerCase().includes(search.toLowerCase())
  );
  const presentToday = filteredAttendance.filter(r => r.check_in && !r.check_out).length;
  const checkedOut = filteredAttendance.filter(r => r.check_out).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground">{t('hr.attendanceTitle')}</h1><p className="text-muted-foreground">{format(new Date(), "EEEE, d. MMMM yyyy", { locale: dateFnsLocale })}</p></div>
      </div>

      {/* Check-in Section */}
      <Card id="check-in-card">
        <CardContent className="pt-6">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium">{t('hr.checkInEmployee') || 'Check in employee'}</label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger><SelectValue placeholder={t('hr.selectEmployee')} /></SelectTrigger>
                <SelectContent>
                  {(employees ?? []).filter(e => e.is_active !== false).map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name} — {e.position || e.department || e.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCheckIn} disabled={!selectedEmployee || checkIn.isPending}>
              <LogIn className="h-4 w-4 mr-2" /> {t('hr.checkIn')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center"><UserCheck className="h-6 w-6 text-success" /></div><div><p className="text-sm text-muted-foreground">{t('hr.presentNow')}</p><p className="text-2xl font-bold text-success">{presentToday}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><LogOut className="h-6 w-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">{t('hr.checkedOut')}</p><p className="text-2xl font-bold">{checkedOut}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><Clock className="h-6 w-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">{t('hr.totalRecords')}</p><p className="text-2xl font-bold">{records.length}</p></div></div></CardContent></Card>
      </div>

      <div className="flex items-center gap-4"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder={t('hr.searchEmployeePlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div></div>

      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>{t('hr.employee')}</TableHead><TableHead>{t('hr.checkIn')}</TableHead><TableHead>{t('hr.checkOut')}</TableHead><TableHead>{t('hr.statusLabel')}</TableHead><TableHead>{t('hr.action')}</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (<TableRow key={i}><TableCell><Skeleton className="h-4 w-32" /></TableCell><TableCell><Skeleton className="h-4 w-16" /></TableCell><TableCell><Skeleton className="h-4 w-16" /></TableCell><TableCell><Skeleton className="h-6 w-20" /></TableCell><TableCell><Skeleton className="h-8 w-24" /></TableCell></TableRow>))
            : filteredAttendance.length === 0 ? (<TableRow><TableCell colSpan={5}>
                <EmptyState
                  bare
                  icon={Clock}
                  title={error ? t('hr.fetchAttendanceError') : t('hr.noAttendance')}
                  hint={t('hr.attendanceGuide') || 'Track employee check-ins and check-outs. Select an employee above and click "Check In" to register their arrival.'}
                  action={!error ? { label: t('hr.checkIn'), onClick: () => document.getElementById('check-in-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), icon: LogIn } : undefined}
                />
              </TableCell></TableRow>)
            : filteredAttendance.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="font-medium">{record.employee_profiles?.full_name || t('hr.unknown')}</TableCell>
                <TableCell>{format(new Date(record.check_in), 'HH:mm')}</TableCell>
                <TableCell>{record.check_out ? format(new Date(record.check_out), 'HH:mm') : '-'}</TableCell>
                <TableCell>{record.check_out ? <Badge variant="secondary">{t('hr.finished')}</Badge> : <Badge className="bg-success/15 text-success">{t('hr.present')}</Badge>}</TableCell>
                <TableCell>{!record.check_out && <Button size="sm" variant="outline" onClick={() => handleCheckOut(record.id)} disabled={checkOut.isPending}><LogOut className="h-4 w-4 mr-1" />{t('hr.checkOutBtn')}</Button>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
