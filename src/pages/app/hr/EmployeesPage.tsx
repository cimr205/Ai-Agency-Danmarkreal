import { useState } from 'react';
import { useEmployees, useCreateEmployee } from '@/hooks/api/useEmployees';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, UserCheck, Building2 } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import EmployeeDetailPanel from '@/components/hr/EmployeeDetailPanel';
import type { Tables } from '@/integrations/supabase/types';

export default function EmployeesPage() {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Tables<'employee_profiles'> | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ full_name: '', email: '', position: '', department: '' });

  const { data, isLoading, error } = useEmployees();
  const createEmployee = useCreateEmployee();

  const employees = data ?? [];
  const filteredEmployees = employees.filter(e => {
    const s = search.toLowerCase();
    return e.full_name.toLowerCase().includes(s) || e.email.toLowerCase().includes(s) || (e.department || '').toLowerCase().includes(s);
  });

  const departments = [...new Set(employees.map(e => e.department).filter(Boolean))];

  const handleCreate = async () => {
    if (!newEmployee.full_name || !newEmployee.email) { toast.error(t('hr.nameEmailRequired')); return; }
    if (!newEmployee.position.trim()) { toast.error(locale === 'da' ? 'Stilling er påkrævet' : 'Position is required'); return; }
    if (!newEmployee.department.trim()) { toast.error(locale === 'da' ? 'Afdeling er påkrævet' : 'Department is required'); return; }
    try {
      await createEmployee.mutateAsync(newEmployee);
      toast.success(t('hr.employeeCreated'));
      setNewEmployee({ full_name: '', email: '', position: '', department: '' });
      setIsCreateOpen(false);
    } catch { toast.error(t('hr.employeeCreateError')); }
  };

  const dateLocale = locale === 'da' ? 'da-DK' : locale === 'de' ? 'de-DE' : 'en-GB';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-foreground">{t('hr.employeesTitle')}</h1><p className="text-muted-foreground">{t('hr.employeesSubtitle')}</p></div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t('hr.newEmployee')}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('hr.addEmployee')}</DialogTitle><DialogDescription>{t('hr.addEmployeeDesc')}</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>{t('hr.nameLabel')}</Label><Input value={newEmployee.full_name} onChange={(e) => setNewEmployee({ ...newEmployee, full_name: e.target.value })} placeholder={t('hr.namePlaceholder')} /></div>
              <div className="space-y-2"><Label>{t('hr.emailLabel')}</Label><Input type="email" value={newEmployee.email} onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })} placeholder={t('hr.emailPlaceholder')} /></div>
              <div className="space-y-2"><Label>{t('hr.positionLabel')} *</Label><Input value={newEmployee.position} onChange={(e) => setNewEmployee({ ...newEmployee, position: e.target.value })} placeholder={t('hr.positionPlaceholder')} /></div>
              <div className="space-y-2"><Label>{t('hr.departmentLabel')} *</Label><Input value={newEmployee.department} onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })} placeholder={t('hr.departmentPlaceholder')} /></div>
              <Button onClick={handleCreate} disabled={createEmployee.isPending} className="w-full">{createEmployee.isPending ? t('hr.creating') : t('hr.createEmployee')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><UserCheck className="h-6 w-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">{t('hr.totalEmployees')}</p><p className="text-2xl font-bold">{employees.length}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><Building2 className="h-6 w-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">{t('hr.departments')}</p><p className="text-2xl font-bold">{departments.length}</p></div></div></CardContent></Card>
      </div>

      <div className="flex items-center gap-4"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder={t('hr.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div></div>

      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>{t('common.name')}</TableHead><TableHead>{t('hr.positionLabel')}</TableHead><TableHead>{t('hr.departmentLabel')}</TableHead><TableHead>{t('hr.startDate')}</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (<TableRow key={i}><TableCell><Skeleton className="h-4 w-32" /></TableCell><TableCell><Skeleton className="h-4 w-28" /></TableCell><TableCell><Skeleton className="h-6 w-20" /></TableCell><TableCell><Skeleton className="h-4 w-24" /></TableCell></TableRow>))
            : filteredEmployees.length === 0 ? (<TableRow><TableCell colSpan={4}>
                <EmptyState
                  bare
                  icon={UserCheck}
                  title={error ? t('hr.fetchError') : t('hr.noEmployees')}
                  action={!error ? { label: t('hr.newEmployee'), onClick: () => setIsCreateOpen(true), icon: Plus } : undefined}
                />
              </TableCell></TableRow>)
            : filteredEmployees.map((employee) => (
              <TableRow key={employee.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedEmployee(employee); setDetailOpen(true); }}>
                <TableCell className="font-medium">{employee.full_name}</TableCell>
                <TableCell>{employee.position || '-'}</TableCell>
                <TableCell><Badge variant="secondary">{employee.department || '-'}</Badge></TableCell>
                <TableCell className="text-muted-foreground">{employee.start_date ? new Date(employee.start_date).toLocaleDateString(dateLocale) : '-'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <EmployeeDetailPanel
        employee={selectedEmployee}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}
