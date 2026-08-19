import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Database, Mail, Users, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

function useSystemMetrics() {
  return useQuery({
    queryKey: ['system-metrics'],
    queryFn: async () => {
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [activityRes, leadsRes, emailsRes, usersRes, emailLogRes] = await Promise.all([
        supabase.from('activity_logs').select('*', { count: 'exact', head: true }).gte('created_at', dayAgo.toISOString()),
        supabase.from('leads').select('*', { count: 'exact', head: true }),
        supabase.from('emails').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('email_send_log').select('status, created_at').gte('created_at', dayAgo.toISOString()).limit(500),
      ]);

      const emailLogs = emailLogRes.data ?? [];
      const sentCount = emailLogs.filter(l => l.status === 'sent').length;
      const failedCount = emailLogs.filter(l => l.status === 'failed' || l.status === 'dlq').length;

      return {
        activitiesLast24h: activityRes.count ?? 0,
        totalLeads: leadsRes.count ?? 0,
        totalEmails: emailsRes.count ?? 0,
        totalUsers: usersRes.count ?? 0,
        emailsSent24h: sentCount,
        emailsFailed24h: failedCount,
        emailDeliveryRate: sentCount + failedCount > 0 ? Math.round((sentCount / (sentCount + failedCount)) * 100) : 100,
      };
    },
    refetchInterval: 30_000,
  });
}

export default function MonitoringPage() {
  const { data: metrics, isLoading } = useSystemMetrics();
  const { t } = useI18n();

  const cards = [
    { title: 'Aktive brugere', value: metrics?.totalUsers ?? '-', icon: Users, color: 'text-primary' },
    { title: 'Total leads', value: metrics?.totalLeads ?? '-', icon: Database, color: 'text-success' },
    { title: 'Aktiviteter (24t)', value: metrics?.activitiesLast24h ?? '-', icon: Activity, color: 'text-accent' },
    { title: 'Emails sendt (24t)', value: metrics?.emailsSent24h ?? '-', icon: Mail, color: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Systemovervågning</h1>
          <p className="text-sm text-muted-foreground">Realtids systemstatus og performance metrics</p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
          System operationelt
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <card.icon className={`w-4 h-4 ${card.color}`} />
                <span className="text-xs text-muted-foreground">{card.title}</span>
              </div>
              <span className="text-2xl font-bold">{isLoading ? '...' : card.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Email Delivery Health */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="w-4 h-4" /> Email-levering
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-success" />
              <div>
                <p className="text-sm font-medium">{metrics?.emailsSent24h ?? 0} sendt</p>
                <p className="text-xs text-muted-foreground">Sidste 24 timer</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <div>
                <p className="text-sm font-medium">{metrics?.emailsFailed24h ?? 0} fejlet</p>
                <p className="text-xs text-muted-foreground">Sidste 24 timer</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-warning" />
              <div>
                <p className="text-sm font-medium">{metrics?.emailDeliveryRate ?? 100}% levering</p>
                <p className="text-xs text-muted-foreground">Leveringsrate</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Database Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4" /> Databasestatus
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Leads</p>
              <p className="text-lg font-semibold">{metrics?.totalLeads ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Emails</p>
              <p className="text-lg font-semibold">{metrics?.totalEmails ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Brugere</p>
              <p className="text-lg font-semibold">{metrics?.totalUsers ?? '-'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Aktiviteter (24t)</p>
              <p className="text-lg font-semibold">{metrics?.activitiesLast24h ?? '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
