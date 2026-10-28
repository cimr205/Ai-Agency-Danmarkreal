import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMyActiveSession, useClockIn, useClockOut, useTimeEntries, type AttendanceLog } from '@/hooks/api/useWorkforce';
import { useEmployees } from '@/hooks/api/useEmployees';
import { useAuth } from '@/hooks/useAuth';
import { Play, Square, Clock, Calendar, Timer, TrendingUp, AlertCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { getErrorMessage } from '@/lib/errors';
import { WorkspaceFrame, WorkspaceGradientSurface } from '@/components/workspace/WorkspacePanel';
import { WorkspaceTile } from '@/components/workspace/Tile';
import { t3 } from '@/lib/inlineI18n';

function BigTimer({ checkIn }: { checkIn: string }) {
  const [display, setDisplay] = useState('0:00:00');
  useEffect(() => {
    const update = () => {
      const totalSec = Math.floor((Date.now() - new Date(checkIn).getTime()) / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      setDisplay(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [checkIn]);
  return <span className="font-mono text-3xl sm:text-5xl font-bold tracking-tight">{display}</span>;
}

export default function TimeTrackingPage() {
  const { t, locale } = useI18n();
  const { isAdmin } = useAuth();
  const { data: session, isLoading: sessionLoading, error: sessionError } = useMyActiveSession();
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const { data: employees } = useEmployees();
  const [selectedEmployee, setSelectedEmployee] = useState('');

  // Auto-select the logged-in user's employee profile
  const { user } = useAuth();
  useEffect(() => {
    if (isAdmin && !selectedEmployee && employees?.length && user?.user_id) {
      const myProfile = employees.find(e => e.user_id === user.user_id);
      if (myProfile) setSelectedEmployee(myProfile.id);
    }
  }, [isAdmin, employees, user?.user_id, selectedEmployee]);
  const [actionError, setActionError] = useState<string | null>(null);

  const isActive = session && 'check_in' in session && !session.check_out;
  const employeeProfileId = session?.employee_profile_id;
  const isReady = !sessionLoading && !!employeeProfileId;

  const today = new Date();
  const weekStart = format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const weekEnd = format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd');

  // For admin: show selected employee's entries, or all if none selected
  const viewEmployeeId = isAdmin && selectedEmployee ? selectedEmployee : employeeProfileId || undefined;

  const { data: weekEntries } = useTimeEntries({ startDate: weekStart, endDate: weekEnd, employeeId: viewEmployeeId });
  const { data: monthEntries } = useTimeEntries({ startDate: monthStart, endDate: monthEnd, employeeId: viewEmployeeId });

  // Hours that fall inside [from, to] — an entry (or a session still open)
  // is clipped to the period. Counting whole entries by their check-in date
  // made a session open since last week show 0h this week but 171h this month.
  const calcHours = (entries: AttendanceLog[], from: Date, to: Date) => {
    const seen = new Set<string>();
    return entries.reduce((total, e) => {
      if (seen.has(e.id)) return total;
      seen.add(e.id);
      const start = Math.max(new Date(e.check_in).getTime(), from.getTime());
      const end = Math.min(e.check_out ? new Date(e.check_out).getTime() : Date.now(), to.getTime());
      return end > start ? total + (end - start) / 3600000 : total;
    }, 0);
  };

  const viewingSelf = !viewEmployeeId || viewEmployeeId === employeeProfileId;
  const openSession = viewingSelf && isActive && session ? [session as unknown as AttendanceLog] : [];
  const periodEntries = [...(weekEntries ?? []), ...(monthEntries ?? []), ...openSession];
  const weekHours = Math.round(calcHours(periodEntries, startOfWeek(today, { weekStartsOn: 1 }), endOfWeek(today, { weekStartsOn: 1 })) * 10) / 10;
  const monthHours = Math.round(calcHours(periodEntries, startOfMonth(today), endOfMonth(today)) * 10) / 10;

  const handleClockIn = useCallback(async () => {
    setActionError(null);
    const targetId = isAdmin && selectedEmployee ? selectedEmployee : employeeProfileId;
    if (!targetId) {
      const msg = t3("Ingen medarbejderprofil fundet. Prøv at genindlæse siden.", "No employee profile found. Try reloading the page.", "Kein Mitarbeiterprofil gefunden. Bitte Seite neu laden.");
      setActionError(msg);
      toast.error(msg);
      return;
    }
    try {
      await clockIn.mutateAsync(targetId);
      toast.success(t('workforce.clockedIn'));
    } catch (err) {
      const msg = getErrorMessage(err) || t3("Clock-in fejlede", "Clock-in failed", "Einstempeln fehlgeschlagen");
      setActionError(msg);
      toast.error(msg);
    }
  }, [isAdmin, selectedEmployee, employeeProfileId, clockIn, t]);

  const handleClockOut = useCallback(async () => {
    setActionError(null);
    if (!session || !('id' in session)) {
      const msg = t3("Ingen aktiv session fundet", "No active session found", "Keine aktive Sitzung gefunden");
      setActionError(msg);
      toast.error(msg);
      return;
    }
    try {
      await clockOut.mutateAsync(session.id);
      toast.success(t('workforce.clockedOut'));
    } catch (err) {
      const msg = getErrorMessage(err) || t3("Clock-out fejlede", "Clock-out failed", "Ausstempeln fehlgeschlagen");
      setActionError(msg);
      toast.error(msg);
    }
  }, [session, clockOut, t]);

  // History - last 14 days
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0];
  const { data: history, isLoading: historyLoading } = useTimeEntries({
    startDate: twoWeeksAgo,
    endDate: format(today, 'yyyy-MM-dd'),
    employeeId: viewEmployeeId,
  });

  return (
    <div className="workspace-theme space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('workforce.timeTrackingTitle')}</h1>
        <p className="text-muted-foreground">{t('workforce.timeTrackingSubtitle')}</p>
      </div>

      {/* Admin: select employee */}
      {isAdmin && (
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium">{t('workforce.clockInFor')}</label>
                <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                  <SelectTrigger><SelectValue placeholder={t('workforce.selectEmployee')} /></SelectTrigger>
                  <SelectContent>
                    {(employees ?? []).filter(e => e.is_active !== false).map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.full_name} — {e.position || e.department || e.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {sessionError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm">{t3("Fejl ved indlæsning af session", "Error loading session", "Fehler beim Laden der Sitzung")}: {getErrorMessage(sessionError) || t3("Ukendt fejl", "Unknown error", "Unbekannter Fehler")}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action error inline */}
      {actionError && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">{actionError}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Clock In/Out Hero */}
      <Card className="border-border/50 overflow-hidden">
        <CardContent className="pt-8 pb-8">
          {sessionLoading ? (
            <div className="flex flex-col items-center gap-4"><Skeleton className="h-16 w-64" /><Skeleton className="h-14 w-48" /></div>
          ) : (
            <div className="flex flex-col items-center gap-6">
              {isActive ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-success animate-pulse" />
                    <span className="text-sm font-medium text-success">{t('workforce.currentlyTracking')}</span>
                  </div>
                  <BigTimer checkIn={session.check_in} />
                  <p className="text-sm text-muted-foreground">
                    {t('workforce.startedAt')} {format(new Date(session.check_in), 'HH:mm')}
                  </p>
                  <button
                    type="button"
                    className="h-16 w-full max-w-xs text-base sm:text-lg rounded-2xl shadow-lg flex items-center justify-center gap-2 font-medium bg-destructive text-destructive-foreground active:scale-95 transition-transform touch-manipulation select-none disabled:opacity-50"
                    onClick={handleClockOut}
                    disabled={clockOut.isPending}
                  >
                    <Square className="h-5 w-5 shrink-0" />
                    {clockOut.isPending ? 'Stopper...' : t('workforce.stopWorkday')}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full bg-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{t('workforce.notTracking')}</span>
                  </div>
                  <span className="font-mono text-3xl sm:text-5xl font-bold tracking-tight text-muted-foreground/50">0:00:00</span>
                  {!isReady && !sessionError && (
                    <p className="text-xs text-muted-foreground animate-pulse">Forbereder...</p>
                  )}
                  <button
                    type="button"
                    className="h-16 w-full max-w-xs text-base sm:text-lg rounded-2xl shadow-lg shadow-success/25 flex items-center justify-center gap-2 font-medium bg-success text-success-foreground active:bg-success/80 active:scale-95 transition-transform touch-manipulation select-none disabled:opacity-50"
                    onClick={handleClockIn}
                    disabled={clockIn.isPending || (!isReady && !(isAdmin && selectedEmployee))}
                  >
                    <Play className="h-5 w-5 shrink-0" />
                    {clockIn.isPending ? 'Starter...' : t('workforce.startWorkday')}
                  </button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* A workday open for more than 16 hours is almost certainly a missed
          clock-out; say so instead of silently accruing hours for days. */}
      {isActive && session && (Date.now() - new Date(session.check_in).getTime()) > 16 * 3600000 && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t('workforce.forgotClockOut').replace('{since}', new Date(session.check_in).toLocaleString(locale === 'da' ? 'da-DK' : locale === 'de' ? 'de-DE' : 'en-GB'))}
        </div>
      )}

      {/* Stats */}
      <WorkspaceFrame>
        <WorkspaceGradientSurface className="p-4">
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
            {/* Only the part of the open session that falls on today counts as
                "today" — a session left open since last week showed 161h today. */}
            <WorkspaceTile label={t('workforce.todayHours')} value={`${isActive && session ? ((Date.now() - Math.max(new Date(session.check_in).getTime(), new Date(new Date().setHours(0, 0, 0, 0)).getTime())) / 3600000).toFixed(1) : '0'}h`} active />
            <WorkspaceTile label={t('workforce.weekHours')} value={`${weekHours}h`} />
            <WorkspaceTile label={t('workforce.monthHours')} value={`${monthHours}h`} />
          </div>
        </WorkspaceGradientSurface>
      </WorkspaceFrame>

      {/* History */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Timer className="h-5 w-5 text-primary" />
            {t('workforce.recentHistory')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (history?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">{t('workforce.noHistory')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 font-medium text-muted-foreground">{t('workforce.date')}</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">{t('workforce.clockIn')}</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">{t('workforce.clockOut')}</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">{t('workforce.totalHours')}</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">{t('workforce.statusLabel')}</th>
                  </tr>
                </thead>
                <tbody>
                  {history!.map((entry: AttendanceLog) => {
                    const ci = new Date(entry.check_in);
                    const co = entry.check_out ? new Date(entry.check_out) : null;
                    const hrs = co ? ((co.getTime() - ci.getTime()) / 3600000).toFixed(1) : ((Date.now() - ci.getTime()) / 3600000).toFixed(1);
                    return (
                      <tr key={entry.id} className="border-b border-border/20">
                        <td className="py-2.5">{format(ci, 'dd/MM/yyyy')}</td>
                        <td className="py-2.5 font-mono">{format(ci, 'HH:mm')}</td>
                        <td className="py-2.5 font-mono">{co ? format(co, 'HH:mm') : '-'}</td>
                        <td className="py-2.5 font-mono">{hrs}h</td>
                        <td className="py-2.5">
                          {co ? <Badge variant="secondary">{t('workforce.completed')}</Badge> : <Badge className="bg-success/15 text-success">{t('workforce.active')}</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
