import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Building2, Users, RefreshCw, Shield, Mail, Phone,
  ChevronDown, ChevronUp, CreditCard, Crown, UserCheck,
  DollarSign, AlertTriangle
} from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface OwnerInfo {
  user_id: string;
  full_name: string | null;
  email: string;
}

interface EmployeeInfo {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  position: string | null;
  department: string | null;
}

interface RawProfile { user_id: string; company_id: string; full_name: string | null; email: string }
interface RawRole { user_id: string; role: string }
interface RawEmployee extends EmployeeInfo { company_id: string }
interface RawCompany {
  id: string; name: string; phone: string | null; email: string | null;
  status: string | null; subscription_status: string | null; stripe_customer_id: string | null;
  stripe_subscription_id: string | null; trial_ends_at: string | null; industry: string | null;
  created_at: string; disabled?: boolean;
}

interface CompanyFull {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  industry: string | null;
  created_at: string;
  disabled: boolean;
  owners: OwnerInfo[];
  employees: EmployeeInfo[];
  userCount: number;
}

export default function AdminOverviewPage() {
  const [companies, setCompanies] = useState<CompanyFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const verified = sessionStorage.getItem('admin_verified');
  // Store the admin code so we can use it for API calls
  const adminCode = sessionStorage.getItem('admin_code');

  const loadAll = useCallback(async () => {
    if (!adminCode) return;
    setLoading(true);
    try {
      console.log('[AdminOverview] Fetching data with admin code present:', !!adminCode);
      const { data, error } = await supabase.functions.invoke('admin-data', {
        body: { code: adminCode },
      });
      console.log('[AdminOverview] Response:', { data: data ? Object.keys(data) : null, error });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const profiles = data.profiles || [];
      const employees = data.employees || [];
      const roles = data.roles || [];
      const adminUserIds = new Set((roles as RawRole[]).filter((r) => r.role === 'company_admin').map((r) => r.user_id));

      const result: CompanyFull[] = (data.companies as RawCompany[] || []).map((c) => {
        const companyProfiles = (profiles as RawProfile[]).filter((p) => p.company_id === c.id);
        const owners = companyProfiles
          .filter((p) => adminUserIds.has(p.user_id))
          .map((p) => ({ user_id: p.user_id, full_name: p.full_name, email: p.email }));

        return {
          ...c,
          disabled: c.disabled ?? false,
          owners,
          employees: (employees as RawEmployee[]).filter((e) => e.company_id === c.id),
          userCount: companyProfiles.length,
        };
      });

      setCompanies(result);
    } catch (err) {
      toast.error('Kunne ikke hente data: ' + (err instanceof Error ? err.message : 'Ukendt fejl'));
    } finally {
      setLoading(false);
    }
  }, [adminCode]);

  useEffect(() => {
    if (verified && adminCode) loadAll();
  }, [verified, adminCode, loadAll]);

  if (!verified) return <Navigate to="/en/admin" replace />;

  const toggleCompany = async (companyId: string, currentDisabled: boolean) => {
    if (!adminCode) return;
    setTogglingIds(prev => new Set(prev).add(companyId));
    try {
      const { data, error } = await supabase.functions.invoke('admin-data', {
        body: { code: adminCode, action: 'toggle_company', companyId, disabled: !currentDisabled },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, disabled: !currentDisabled } : c));
      toast.success(!currentDisabled ? 'Virksomhed deaktiveret' : 'Virksomhed aktiveret');
    } catch (err) {
      toast.error('Kunne ikke ændre status: ' + (err instanceof Error ? err.message : 'Ukendt fejl'));
    }
    setTogglingIds(prev => { const s = new Set(prev); s.delete(companyId); return s; });
  };

  const totalCompanies = companies.length;
  const totalUsers = companies.reduce((s, c) => s + c.userCount, 0);
  const totalEmployees = companies.reduce((s, c) => s + c.employees.length, 0);
  const payingCompanies = companies.filter(c => c.subscription_status === 'active').length;
  const trialingCompanies = companies.filter(c => c.subscription_status === 'trialing').length;
  const disabledCompanies = companies.filter(c => c.disabled).length;
  const mrr = payingCompanies * 499;

  const subBadge = (status: string | null) => {
    switch (status) {
      case 'active': return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Betaler</Badge>;
      case 'trialing': return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Prøveperiode</Badge>;
      case 'canceled': return <Badge variant="destructive">Annulleret</Badge>;
      default: return <Badge variant="secondary">Ingen</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-destructive/10 p-3">
            <Shield className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Admin Overblik</h1>
            <p className="text-sm text-muted-foreground">Komplet oversigt over alle virksomheder</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadAll} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Opdater
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {loading ? [1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />) : (
          <>
            <KpiCard icon={Building2} label="Virksomheder" value={totalCompanies.toString()} color="text-primary" />
            <KpiCard icon={Users} label="Brugere" value={totalUsers.toString()} color="text-blue-500" />
            <KpiCard icon={UserCheck} label="Medarbejdere" value={totalEmployees.toString()} color="text-emerald-500" />
            <KpiCard icon={CreditCard} label="Betalende" value={payingCompanies.toString()} color="text-green-500" />
            <KpiCard icon={DollarSign} label="MRR (DKK)" value={mrr.toLocaleString('da-DK')} color="text-amber-500" />
            <KpiCard icon={AlertTriangle} label="Deaktiverede" value={disabledCompanies.toString()} color="text-red-500" />
          </>
        )}
      </div>

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="rounded-2xl border-emerald-500/20">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-emerald-400 mb-1">💰 Betalende kunder</p>
              <p className="text-3xl font-bold">{payingCompanies}</p>
              <p className="text-xs text-muted-foreground mt-1">{payingCompanies * 499} DKK/md omsætning</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-amber-500/20">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-amber-400 mb-1">⏳ Prøveperiode</p>
              <p className="text-3xl font-bold">{trialingCompanies}</p>
              <p className="text-xs text-muted-foreground mt-1">Potentiel: {trialingCompanies * 499} DKK/md</p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl border-red-500/20">
            <CardContent className="p-5">
              <p className="text-sm font-medium text-red-400 mb-1">🚫 Ikke betalt / ingen plan</p>
              <p className="text-3xl font-bold">{totalCompanies - payingCompanies - trialingCompanies}</p>
              <p className="text-xs text-muted-foreground mt-1">Kræver opfølgning</p>
            </CardContent>
          </Card>
        </div>
      )}

      {loading ? (
        <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : companies.length === 0 ? (
        <Card className="rounded-2xl"><CardContent className="py-12 text-center text-muted-foreground">Ingen virksomheder fundet</CardContent></Card>
      ) : (
        <div className="space-y-4">
          {companies.map(company => {
            const isExpanded = expandedId === company.id;
            return (
              <Card key={company.id} className={`rounded-2xl overflow-hidden transition-all ${company.disabled ? 'opacity-60 border-red-500/30' : ''}`}>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between p-5">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : company.id)}
                      className="flex items-center gap-4 min-w-0 text-left flex-1"
                    >
                      <div className={`rounded-xl p-2.5 shrink-0 ${company.disabled ? 'bg-red-500/10' : 'bg-primary/10'}`}>
                        <Building2 className={`h-5 w-5 ${company.disabled ? 'text-red-500' : 'text-primary'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-base truncate">{company.name}</p>
                          {subBadge(company.subscription_status)}
                          {company.disabled && <Badge variant="destructive">DEAKTIVERET</Badge>}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                          {company.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{company.email}</span>}
                          {company.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{company.phone}</span>}
                          <span>{company.userCount} brugere</span>
                          <span>{company.employees.length} medarbejdere</span>
                          <span>Oprettet {format(new Date(company.created_at), 'dd/MM/yyyy')}</span>
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground hidden sm:block">{company.disabled ? 'Deaktiveret' : 'Aktiv'}</span>
                        <Switch
                          checked={!company.disabled}
                          disabled={togglingIds.has(company.id)}
                          onCheckedChange={() => toggleCompany(company.id, company.disabled)}
                        />
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border/50 p-5 space-y-6 bg-muted/10">
                      <div>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <CreditCard className="h-3.5 w-3.5" /> Betaling
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <InfoCell label="Abonnement" value={company.subscription_status || 'Ingen'} />
                          <InfoCell label="Stripe Kunde" value={company.stripe_customer_id ? '✅ Tilknyttet' : '❌ Mangler'} />
                          <InfoCell label="Stripe Abonnement" value={company.stripe_subscription_id ? '✅ Aktiv' : '❌ Ingen'} />
                          <InfoCell label="Prøveperiode udløber" value={company.trial_ends_at ? format(new Date(company.trial_ends_at), 'dd/MM/yyyy') : '—'} />
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Crown className="h-3.5 w-3.5 text-amber-500" /> Ejere ({company.owners.length})
                        </h3>
                        {company.owners.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Ingen ejere registreret</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {company.owners.map(owner => (
                              <div key={owner.user_id} className="flex items-center gap-3 p-3 rounded-xl bg-background/60 border border-border/30">
                                <Crown className="h-4 w-4 text-amber-500 shrink-0" />
                                <div className="min-w-0">
                                  <p className="font-medium text-sm truncate">{owner.full_name || 'Ukendt'}</p>
                                  <p className="text-xs text-muted-foreground truncate">{owner.email}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <UserCheck className="h-3.5 w-3.5 text-emerald-500" /> Medarbejdere ({company.employees.length})
                        </h3>
                        {company.employees.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Ingen medarbejdere</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs text-muted-foreground border-b border-border/30">
                                  <th className="pb-2 pr-4 font-medium">Navn</th>
                                  <th className="pb-2 pr-4 font-medium">Stilling</th>
                                  <th className="pb-2 pr-4 font-medium">Afdeling</th>
                                  <th className="pb-2 pr-4 font-medium">Email</th>
                                  <th className="pb-2 font-medium">Telefon</th>
                                </tr>
                              </thead>
                              <tbody>
                                {company.employees.map(emp => (
                                  <tr key={emp.id} className="border-b border-border/10 last:border-0">
                                    <td className="py-2 pr-4 font-medium">{emp.full_name}</td>
                                    <td className="py-2 pr-4 text-muted-foreground">{emp.position || '—'}</td>
                                    <td className="py-2 pr-4 text-muted-foreground">{emp.department || '—'}</td>
                                    <td className="py-2 pr-4 text-muted-foreground">{emp.email}</td>
                                    <td className="py-2 text-muted-foreground">{emp.phone || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
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

function KpiCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; color: string }) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-xl bg-muted/60 p-2.5">
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/60 border border-border/30 p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}
