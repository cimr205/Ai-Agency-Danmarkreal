import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Building2, ChevronDown, ChevronRight, Shield,
  Loader2, UserPlus, UserCircle, Activity, Menu
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface Company {
  id: string;
  name: string;
  status: string | null;
  created_at: string;
}

interface Employee {
  id: string;
  full_name: string;
  email: string;
  position: string | null;
  department: string | null;
  is_active: boolean | null;
  created_at: string;
}

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  company_id: string | null;
}

export default function AdminActivityPanel({ basePath }: { basePath: string }) {
  const location = useLocation();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employeesByCompany, setEmployeesByCompany] = useState<Record<string, Employee[]>>({});
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [loadingEmployees, setLoadingEmployees] = useState<Set<string>>(new Set());
  const [recentProfiles, setRecentProfiles] = useState<Profile[]>([]);
  const [recentEmployees, setRecentEmployees] = useState<(Employee & { company_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [companiesRes, profilesRes, employeesRes] = await Promise.all([
      supabase.from('companies').select('id, name, status, created_at').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, email, full_name, created_at, company_id').order('created_at', { ascending: false }).limit(20),
      supabase.from('employee_profiles').select('id, full_name, email, position, department, is_active, created_at, company_id').order('created_at', { ascending: false }).limit(20),
    ]);

    const companyList = companiesRes.data || [];
    setCompanies(companyList);
    setRecentProfiles(profilesRes.data || []);

    const companyMap = Object.fromEntries(companyList.map(c => [c.id, c.name]));
    setRecentEmployees(
      (employeesRes.data || []).map(e => ({
        ...e,
        company_name: companyMap[e.company_id] || 'Ukendt',
      }))
    );
    setLoading(false);
  };

  const toggleCompany = async (companyId: string) => {
    const next = new Set(expandedCompanies);
    if (next.has(companyId)) {
      next.delete(companyId);
    } else {
      next.add(companyId);
      if (!employeesByCompany[companyId]) {
        setLoadingEmployees(prev => new Set(prev).add(companyId));
        const { data } = await supabase
          .from('employee_profiles')
          .select('id, full_name, email, position, department, is_active, created_at')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false });
        setEmployeesByCompany(prev => ({ ...prev, [companyId]: data || [] }));
        setLoadingEmployees(prev => { const s = new Set(prev); s.delete(companyId); return s; });
      }
    }
    setExpandedCompanies(next);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m siden`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}t siden`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d siden`;
    return d.toLocaleDateString('da-DK');
  };

  const panelContent = (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        <Link
          to={`${basePath}/admin/overview`}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            location.pathname.includes('admin/overview')
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground hover:bg-muted'
          )}
        >
          <Shield className="h-4 w-4" />
          Admin Overblik
        </Link>

        {/* Nye brugere */}
        <div>
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <UserCircle className="h-3.5 w-3.5" />
            Nye brugere ({recentProfiles.length})
          </div>
          <div className="mt-1 space-y-0.5">
            {loading ? (
              <div className="flex items-center justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : recentProfiles.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Ingen brugere endnu</p>
            ) : (
              recentProfiles.map(p => (
                <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted/50 transition-colors">
                  <UserCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{p.full_name || p.email}</p>
                    <p className="text-muted-foreground truncate">{p.email}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDate(p.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Nye medarbejdere */}
        <div>
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5" />
            Nye medarbejdere ({recentEmployees.length})
          </div>
          <div className="mt-1 space-y-0.5">
            {loading ? (
              <div className="flex items-center justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : recentEmployees.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Ingen medarbejdere endnu</p>
            ) : (
              recentEmployees.map(e => (
                <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted/50 transition-colors">
                  <div className={cn('h-2 w-2 rounded-full shrink-0', e.is_active ? 'bg-primary' : 'bg-muted-foreground/40')} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{e.full_name}</p>
                    <p className="text-muted-foreground truncate">{e.company_name} · {e.position || e.department || e.email}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDate(e.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Virksomheder */}
        <div>
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Virksomheder ({companies.length})
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : companies.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Ingen virksomheder</p>
          ) : (
            <div className="space-y-0.5 mt-1">
              {companies.map((company) => {
                const isExpanded = expandedCompanies.has(company.id);
                const employees = employeesByCompany[company.id] || [];
                const isLoadingEmps = loadingEmployees.has(company.id);
                return (
                  <div key={company.id}>
                    <button
                      onClick={() => toggleCompany(company.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm transition-colors text-left',
                        isExpanded ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted'
                      )}
                    >
                      {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
                      <Building2 className="h-4 w-4 shrink-0" />
                      <span className="truncate flex-1">{company.name}</span>
                      <Badge variant={company.status === 'active' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                        {company.status || 'setup'}
                      </Badge>
                    </button>
                    {isExpanded && (
                      <div className="ml-5 pl-3 border-l border-border/50 mt-0.5 space-y-0.5">
                        {isLoadingEmps ? (
                          <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" /> Henter medarbejdere...
                          </div>
                        ) : employees.length === 0 ? (
                          <p className="px-2 py-1.5 text-xs text-muted-foreground">Ingen medarbejdere</p>
                        ) : (
                          employees.map((emp) => (
                            <div key={emp.id} className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-muted/50 transition-colors">
                              <div className={cn('h-2 w-2 rounded-full shrink-0', emp.is_active ? 'bg-primary' : 'bg-muted-foreground/40')} />
                              <div className="min-w-0 flex-1">
                                <p className="font-medium truncate">{emp.full_name}</p>
                                <p className="text-muted-foreground truncate">{emp.position || emp.department || emp.email}</p>
                              </div>
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{formatDate(emp.created_at)}</span>
                            </div>
                          ))
                        )}
                        <div className="px-2 py-1 text-[10px] text-muted-foreground">
                          {employees.length} medarbejder{employees.length !== 1 ? 'e' : ''}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );

  return (
    <>
      {/* Desktop panel */}
      <aside className="hidden lg:flex lg:flex-col w-72 border-r border-border bg-card/50">
        <div className="p-3 border-b border-border flex items-center gap-2">
          <Activity className="h-4 w-4 text-destructive" />
          <span className="text-sm font-semibold">Aktivitet</span>
        </div>
        <div className="flex-1 min-h-0">
          {panelContent}
        </div>
      </aside>

      {/* Mobile sheet */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="icon" className="lg:hidden fixed bottom-4 right-4 z-50 rounded-full shadow-lg">
            <Activity className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-80 p-0">
          <div className="p-3 border-b border-border flex items-center gap-2">
            <Activity className="h-4 w-4 text-destructive" />
            <span className="text-sm font-semibold">Aktivitet</span>
          </div>
          {panelContent}
        </SheetContent>
      </Sheet>
    </>
  );
}
