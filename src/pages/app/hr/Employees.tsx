import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

type Employee = {
  id: string;
  employee_id: string;
  full_name: string;
  email: string;
  position: string | null;
  department: string | null;
  is_active: boolean | null;
  start_date: string | null;
  created_at: string;
};

export default function EmployeesPage() {
  const { t } = useI18n();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
    if (!profile?.company_id) { setLoading(false); return; }
    const { data } = await supabase
      .from('employee_profiles')
      .select('id, employee_id, full_name, email, position, department, is_active, start_date, created_at')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false });
    if (data) setEmployees(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('hr.employeesTitle')}</h1>
        <Button variant="outline" onClick={load} disabled={loading}>Refresh</Button>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
      ) : employees.length === 0 ? (
        <div className="text-sm text-muted-foreground">{t('hr.empty')}</div>
      ) : (
        <div className="rounded-xl border border-border bg-card/70 backdrop-blur">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Navn</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Stilling</TableHead>
                <TableHead>Afdeling</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Startdato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.employee_id}</TableCell>
                  <TableCell>{e.full_name}</TableCell>
                  <TableCell>{e.email}</TableCell>
                  <TableCell>{e.position || '—'}</TableCell>
                  <TableCell>{e.department || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={e.is_active ? 'default' : 'secondary'}>
                      {e.is_active ? 'Aktiv' : 'Inaktiv'}
                    </Badge>
                  </TableCell>
                  <TableCell>{e.start_date ? new Date(e.start_date).toLocaleDateString() : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
