import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkforceLive, type AttendanceLog } from '@/hooks/api/useWorkforce';
import { useEmployees } from '@/hooks/api/useEmployees';
import { Users, Clock, AlertTriangle, Activity, UserCheck, UserX, Timer, TrendingUp } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { format, differenceInMinutes } from 'date-fns';
import { useState, useEffect } from 'react';

function LiveTimer({ checkIn }: { checkIn: string }) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    const update = () => {
      const mins = differenceInMinutes(new Date(), new Date(checkIn));
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      setElapsed(`${h}h ${m}m`);
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [checkIn]);
  return <span className="font-mono text-sm">{elapsed}</span>;
}

export default function WorkforceDashboardPage() {
  const { t } = useI18n();
  const { data: live, isLoading } = useWorkforceLive();
  const { data: employees } = useEmployees();

  const totalEmployees = employees?.filter(e => e.is_active !== false).length ?? 0;
  const activeNow = live?.activeNow?.length ?? 0;
  const notCheckedIn = totalEmployees - (live?.totalEntriesToday ?? 0);

  const kpis = [
    { label: t('workforce.activeNow'), value: activeNow, icon: Activity, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
    { label: t('workforce.totalHoursToday'), value: `${live?.totalHoursToday ?? 0}h`, icon: Clock, color: 'text-primary', bgColor: 'bg-primary/10' },
    { label: t('workforce.notCheckedIn'), value: Math.max(0, notCheckedIn), icon: UserX, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
    { label: t('workforce.totalEmployees'), value: totalEmployees, icon: Users, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('workforce.dashboardTitle')}</h1>
        <p className="text-muted-foreground">{t('workforce.dashboardSubtitle')}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="border-border/50">
            <CardContent className="pt-6">
              {isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl ${kpi.bgColor} flex items-center justify-center`}>
                    <kpi.icon className={`h-6 w-6 ${kpi.color}`} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{kpi.label}</p>
                    <p className="text-2xl font-bold">{kpi.value}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Currently Working */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-500" />
              {t('workforce.currentlyWorking')}
              <Badge variant="secondary" className="ml-auto">{activeNow}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (live?.activeNow?.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-sm py-4 text-center">{t('workforce.noOneWorking')}</p>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {live!.activeNow.map((entry: AttendanceLog) => (
                  <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                    <div>
                      <p className="font-medium text-sm">{entry.employee_profiles?.full_name}</p>
                      <p className="text-xs text-muted-foreground">{entry.employee_profiles?.department || entry.employee_profiles?.position || '-'}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        <LiveTimer checkIn={entry.check_in} />
                      </div>
                      <p className="text-xs text-muted-foreground">{t('workforce.since')} {format(new Date(entry.check_in), 'HH:mm')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t('workforce.alerts')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : (
              <div className="space-y-2">
                {(live?.missingCheckout?.length ?? 0) > 0 && live!.missingCheckout.map((entry: AttendanceLog) => (
                  <div key={entry.id} className="flex items-center gap-3 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                    <Timer className="h-4 w-4 text-destructive shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{entry.employee_profiles?.full_name}</p>
                      <p className="text-xs text-muted-foreground">{t('workforce.missingCheckout')}</p>
                    </div>
                  </div>
                ))}
                {Math.max(0, notCheckedIn) > 0 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <UserX className="h-4 w-4 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{Math.max(0, notCheckedIn)} {t('workforce.employeesNotCheckedIn')}</p>
                      <p className="text-xs text-muted-foreground">{t('workforce.haveNotStartedToday')}</p>
                    </div>
                  </div>
                )}
                {(live?.missingCheckout?.length ?? 0) === 0 && notCheckedIn <= 0 && (
                  <p className="text-muted-foreground text-sm py-4 text-center">{t('workforce.noAlerts')}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Today's Activity */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            {t('workforce.todaysActivity')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (live?.logs?.length ?? 0) === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">{t('workforce.noActivityToday')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 font-medium text-muted-foreground">{t('workforce.employee')}</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">{t('workforce.department')}</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">{t('workforce.clockIn')}</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">{t('workforce.clockOut')}</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">{t('workforce.hours')}</th>
                    <th className="text-left py-2 font-medium text-muted-foreground">{t('workforce.statusLabel')}</th>
                  </tr>
                </thead>
                <tbody>
                  {live!.logs.map((entry: AttendanceLog) => {
                    const checkInTime = new Date(entry.check_in);
                    const checkOutTime = entry.check_out ? new Date(entry.check_out) : null;
                    const hours = checkOutTime
                      ? ((checkOutTime.getTime() - checkInTime.getTime()) / 3600000).toFixed(1)
                      : ((Date.now() - checkInTime.getTime()) / 3600000).toFixed(1);
                    return (
                      <tr key={entry.id} className="border-b border-border/20">
                        <td className="py-2.5 font-medium">{entry.employee_profiles?.full_name}</td>
                        <td className="py-2.5 text-muted-foreground">{entry.employee_profiles?.department || '-'}</td>
                        <td className="py-2.5 font-mono">{format(checkInTime, 'HH:mm')}</td>
                        <td className="py-2.5 font-mono">{checkOutTime ? format(checkOutTime, 'HH:mm') : '-'}</td>
                        <td className="py-2.5 font-mono">{hours}h</td>
                        <td className="py-2.5">
                          {entry.check_out ? (
                            <Badge variant="secondary">{t('workforce.completed')}</Badge>
                          ) : (
                            <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">{t('workforce.active')}</Badge>
                          )}
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
