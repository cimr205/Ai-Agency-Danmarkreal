import { useI18n } from '@/lib/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, UserPlus, FileText, CreditCard, Users, CheckCircle2, Mail, Zap, Activity } from 'lucide-react';
import { useActivityLogs } from '@/hooks/api/useActivityLogs';
import { formatDistanceToNow } from 'date-fns';
import { da } from 'date-fns/locale';

const iconMap: Record<string, { icon: React.ElementType; color: string }> = {
  lead: { icon: UserPlus, color: 'text-primary bg-primary/10' },
  invoice: { icon: FileText, color: 'text-[var(--success-color)] bg-[var(--success-subtle)]' },
  payment: { icon: CreditCard, color: 'text-[var(--success-color)] bg-[var(--success-subtle)]' },
  employee: { icon: Users, color: 'text-accent bg-accent/10' },
  task: { icon: CheckCircle2, color: 'text-[var(--success-color)] bg-[var(--success-subtle)]' },
  deal: { icon: Zap, color: 'text-[var(--warning-color)] bg-[var(--warning-subtle)]' },
  email: { icon: Mail, color: 'text-[var(--info)] bg-[var(--info-subtle)]' },
};

const defaultIcon = { icon: Activity, color: 'text-muted-foreground bg-muted' };

export default function HistoryPage() {
  const { t } = useI18n();
  const { data: activities, isLoading } = useActivityLogs(100);

  const todayCount = (activities ?? []).filter(a => {
    const diff = Date.now() - new Date(a.created_at).getTime();
    return diff < 86400000;
  }).length;

  const types = [...new Set((activities ?? []).map(a => a.entity_type).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('work.companyHistoryTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('work.companyHistorySubtitle')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">I dag</p><p className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-8" /> : todayCount}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-8" /> : (activities?.length ?? 0)}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Kategorier</p><p className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-8" /> : types.length}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Status</p><Badge variant="outline" className="mt-1">Live</Badge></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" /> Aktivitetslog</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-4"><Skeleton className="h-10 w-10 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-64" /></div></div>
              ))}
            </div>
          ) : !activities || activities.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Ingen aktivitet registreret endnu.</p>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-4">
                  {activities.map(activity => {
                    const { icon: Icon, color } = iconMap[activity.entity_type ?? ''] ?? defaultIcon;
                    return (
                      <div key={activity.id} className="flex gap-4 relative">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 z-10 ${color}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm">{activity.action_type}</p>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true, locale: da })}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{activity.description ?? '–'}</p>
                          {activity.entity_type && (
                            <Badge variant="secondary" className="mt-1 text-xs">{activity.entity_type}</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
