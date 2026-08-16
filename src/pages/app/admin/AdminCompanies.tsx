import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';

interface EmployeeInfo {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  user_id: string | null;
}

interface CompanyItem {
  id: string;
  name: string;
  created_at: string;
  employees: EmployeeInfo[];
  userCount: number;
}

interface SessionAgg {
  user_id: string;
  total_seconds: number;
  last_active: string;
}

interface ColdCallerAgg {
  user_id: string;
  count: number;
}

export default function AdminCompaniesPage() {
  const { isSystemAdmin, isLoading: authLoading } = useAuth();
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<Map<string, SessionAgg>>(new Map());
  const [coldCallerData, setColdCallerData] = useState<Map<string, ColdCallerAgg>>(new Map());

  const loadData = useCallback(async () => {
    setLoading(true);
    const [companiesRes, profilesRes, employeesRes, sessionsRes, coldCallerRes] = await Promise.all([
      supabase.from('companies').select('id, name, created_at').order('created_at', { ascending: false }),
      supabase.from('profiles').select('user_id, company_id'),
      supabase.from('employee_profiles').select('id, company_id, full_name, email, created_at, user_id'),
      supabase.from('user_sessions').select('user_id, duration_seconds, started_at, ended_at').order('started_at', { ascending: false }),
      supabase.from('cold_caller_usage').select('user_id'),
    ]);

    const profiles = profilesRes.data || [];
    const employees = employeesRes.data || [];

    // Aggregate sessions per user
    const sessMap = new Map<string, SessionAgg>();
    for (const s of (sessionsRes.data || [])) {
      const existing = sessMap.get(s.user_id);
      const dur = s.duration_seconds || 0;
      const activeTime = s.ended_at || s.started_at;
      if (existing) {
        existing.total_seconds += dur;
        if (activeTime > existing.last_active) existing.last_active = activeTime;
      } else {
        sessMap.set(s.user_id, { user_id: s.user_id, total_seconds: dur, last_active: activeTime });
      }
    }
    setSessionData(sessMap);

    // Aggregate cold caller per user
    const ccMap = new Map<string, ColdCallerAgg>();
    for (const c of (coldCallerRes.data || [])) {
      const existing = ccMap.get(c.user_id);
      if (existing) existing.count++;
      else ccMap.set(c.user_id, { user_id: c.user_id, count: 1 });
    }
    setColdCallerData(ccMap);

    setCompanies(
      (companiesRes.data || []).map(c => ({
        id: c.id,
        name: c.name,
        created_at: c.created_at,
        employees: employees
          .filter(e => e.company_id === c.id)
          .map(e => ({ id: e.id, full_name: e.full_name, email: e.email, created_at: e.created_at, user_id: e.user_id })),
        userCount: profiles.filter(p => p.company_id === c.id).length,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isSystemAdmin) loadData();
  }, [isSystemAdmin, loadData]);

  // Realtime
  useEffect(() => {
    if (!isSystemAdmin) return;
    const channel = supabase
      .channel('admin-companies-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employee_profiles' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_sessions' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cold_caller_usage' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isSystemAdmin, loadData]);

  if (!authLoading && !isSystemAdmin) return <Navigate to="/app" replace />;

  const totalCompanies = companies.length;
  const totalUsers = companies.reduce((s, c) => s + c.userCount, 0);
  const totalSeconds = Array.from(sessionData.values()).reduce((s, v) => s + v.total_seconds, 0);
  const totalColdCaller = Array.from(coldCallerData.values()).reduce((s, v) => s + v.count, 0);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds} sek`;
    const mins = Math.floor(seconds / 60);
    const hrs = Math.floor(mins / 60);
    if (hrs > 0) return `${hrs} t ${mins % 60} m`;
    return `${mins} min`;
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Virksomheder</h1>
        <Button variant="outline" size="sm" onClick={loadData} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Opdater
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : (
          <>
            <KpiCard label="Aktive Virksomheder" value={totalCompanies.toString()} />
            <KpiCard label="Aktive Brugere" value={totalUsers.toString()} />
            <KpiCard label="Samlet Brugstid" value={formatDuration(totalSeconds)} />
            <KpiCard label="Cold Caller Brug" value={totalColdCaller.toLocaleString('da-DK')} />
          </>
        )}
      </div>

      {/* Company list */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
      ) : companies.length === 0 ? (
        <Card className="rounded-xl">
          <CardContent className="py-12 text-center text-muted-foreground">Ingen virksomheder fundet</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {companies.map(company => {
            const isExpanded = expandedId === company.id;
            return (
              <Card key={company.id} className="rounded-xl overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between px-6 py-4">
                    <div>
                      <p className="font-semibold text-base">{company.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Oprettet: {format(new Date(company.created_at), 'dd-MM-yyyy')}
                      </p>
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setExpandedId(isExpanded ? null : company.id)}
                    >
                      Vis medarbejdere
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border/50 px-6 py-4 bg-muted/20">
                      <h3 className="font-semibold text-sm mb-3">
                        Medarbejdere hos {company.name}{' '}
                        <span className="font-normal text-muted-foreground">
                          (Oprettet: {format(new Date(company.created_at), 'dd-MM-yyyy')})
                        </span>
                      </h3>

                      {company.employees.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">Ingen medarbejdere registreret</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-muted-foreground border-b border-border/40">
                                <th className="pb-2 pr-4 font-medium">Navn</th>
                                <th className="pb-2 pr-4 font-medium">Oprettet</th>
                                <th className="pb-2 pr-4 font-medium">Brug af Cold Caller</th>
                                <th className="pb-2 pr-4 font-medium">Brugstid</th>
                                <th className="pb-2 font-medium">Sidst aktiv</th>
                              </tr>
                            </thead>
                            <tbody>
                              {company.employees.map(emp => {
                                const sess = emp.user_id ? sessionData.get(emp.user_id) : null;
                                const cc = emp.user_id ? coldCallerData.get(emp.user_id) : null;
                                return (
                                  <tr key={emp.id} className="border-b border-border/10 last:border-0">
                                    <td className="py-2.5 pr-4 font-medium text-primary">{emp.full_name}</td>
                                    <td className="py-2.5 pr-4 text-muted-foreground">
                                      {format(new Date(emp.created_at), 'dd-MM-yyyy HH:mm:ss')}
                                    </td>
                                    <td className="py-2.5 pr-4 text-muted-foreground">
                                      {cc ? `${cc.count} Sprays` : '0 Sprays'}
                                    </td>
                                    <td className="py-2.5 pr-4 text-muted-foreground">
                                      {sess ? formatDuration(sess.total_seconds) : '0 min'}
                                    </td>
                                    <td className="py-2.5 text-muted-foreground">
                                      {sess ? `Sidst aktiv: ${format(new Date(sess.last_active), 'dd-MM-yyyy HH:mm:ss')}` : '—'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-xl">
      <CardContent className="flex items-center justify-between p-5">
        <span className="text-sm text-muted-foreground">{label}:</span>
        <span className="text-2xl font-bold tracking-tight">{value}</span>
      </CardContent>
    </Card>
  );
}
