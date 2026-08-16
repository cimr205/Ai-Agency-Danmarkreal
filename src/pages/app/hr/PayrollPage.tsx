import { useState, useCallback } from 'react';
import { usePayroll, useCreatePayroll, useEmployees } from '@/hooks/api/useEmployees';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Wallet, Banknote, Users } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { da, de, enUS } from 'date-fns/locale';
import { useI18n } from '@/lib/i18n';

const DATE_LOCALES = { da, de, en: enUS } as const;
const LOCALE_CURRENCY: Record<string, { currency: string; locale: string }> = {
  da: { currency: 'DKK', locale: 'da-DK' },
  de: { currency: 'EUR', locale: 'de-DE' },
  en: { currency: 'DKK', locale: 'da-DK' },
};

export default function PayrollPage() {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newPayroll, setNewPayroll] = useState({ employee_id: '', salary: '', period: '' });

  const dateFnsLocale = DATE_LOCALES[locale] || enUS;
  const currConfig = LOCALE_CURRENCY[locale] || LOCALE_CURRENCY.da;
  const formatCurrency = useCallback((amount: number) =>
    new Intl.NumberFormat(currConfig.locale, { style: 'currency', currency: currConfig.currency }).format(amount), [currConfig]);

  const currentPeriod = format(new Date(), 'yyyy-MM');
  const { data, isLoading, error } = usePayroll({ period: currentPeriod });
  const createPayroll = useCreatePayroll();
  const { data: employees } = useEmployees();

  const handleCreate = async () => {
    if (!newPayroll.employee_id || !newPayroll.salary || !newPayroll.period) { toast.error(t('hr.allFieldsRequired')); return; }
    try {
      await createPayroll.mutateAsync({ employee_profile_id: newPayroll.employee_id, base_salary: parseFloat(newPayroll.salary), net_salary: parseFloat(newPayroll.salary), period: newPayroll.period });
      toast.success(t('hr.payrollRegistered'));
      setNewPayroll({ employee_id: '', salary: '', period: '' });
      setIsCreateOpen(false);
    } catch { toast.error(t('hr.payrollRegisterError')); }
  };

  const payrolls = data ?? [];
  const filteredPayroll = payrolls.filter(record => (record.employee_profiles?.full_name || '').toLowerCase().includes(search.toLowerCase()));
  const totalSalary = payrolls.reduce((sum, p) => sum + Number(p.net_salary), 0);
  const avgSalary = payrolls.length ? totalSalary / payrolls.length : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('hr.payrollTitle')}</h1>
          <p className="text-muted-foreground">{format(new Date(), 'MMMM yyyy', { locale: dateFnsLocale })}</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t('hr.registerPayroll')}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('hr.registerPayrollTitle')}</DialogTitle><DialogDescription>{t('hr.registerPayrollDesc')}</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('hr.employee')}</Label>
                <Select value={newPayroll.employee_id} onValueChange={v => setNewPayroll({ ...newPayroll, employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t('hr.selectEmployee')} /></SelectTrigger>
                  <SelectContent>
                    {(employees ?? []).map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.full_name} — {e.position || e.department || e.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>{t('hr.salaryLabel')}</Label><Input type="number" value={newPayroll.salary} onChange={(e) => setNewPayroll({ ...newPayroll, salary: e.target.value })} placeholder="35000" /></div>
              <div className="space-y-2"><Label>{t('hr.periodLabel')}</Label><Input type="month" value={newPayroll.period} onChange={(e) => setNewPayroll({ ...newPayroll, period: e.target.value })} /></div>
              <Button onClick={handleCreate} disabled={createPayroll.isPending} className="w-full">{createPayroll.isPending ? t('hr.registering') : t('hr.registerPayrollBtn')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center"><Banknote className="h-6 w-6 text-success" /></div><div><p className="text-sm text-muted-foreground">{t('hr.totalSalaryMonth')}</p><p className="text-2xl font-bold text-success">{formatCurrency(totalSalary)}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><Wallet className="h-6 w-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">{t('hr.averageSalary')}</p><p className="text-2xl font-bold">{formatCurrency(avgSalary)}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><Users className="h-6 w-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">{t('hr.records')}</p><p className="text-2xl font-bold">{payrolls.length}</p></div></div></CardContent></Card>
      </div>

      <div className="flex items-center gap-4"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder={t('hr.searchEmployeePlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div></div>

      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>{t('hr.employee')}</TableHead><TableHead>{t('hr.salary')}</TableHead><TableHead>{t('hr.period')}</TableHead></TableRow></TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (<TableRow key={i}><TableCell><Skeleton className="h-4 w-32" /></TableCell><TableCell><Skeleton className="h-4 w-24" /></TableCell><TableCell><Skeleton className="h-4 w-24" /></TableCell></TableRow>))
            : filteredPayroll.length === 0 ? (<TableRow><TableCell colSpan={3} className="text-center py-12 text-muted-foreground">
                <div className="space-y-2">
                  <Banknote className="h-8 w-8 mx-auto text-muted-foreground/40" />
                  <p className="font-medium">{error ? t('hr.fetchPayrollError') : t('hr.noPayroll')}</p>
                  <p className="text-xs max-w-sm mx-auto">{t('hr.payrollGuide') || 'Register monthly salary payments for employees. Click "Register Payroll" to add a salary record for the current period.'}</p>
                </div>
              </TableCell></TableRow>)
            : filteredPayroll.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="font-medium">{record.employee_profiles?.full_name || t('hr.unknown')}</TableCell>
                <TableCell className="font-medium text-success">{formatCurrency(record.net_salary)}</TableCell>
                <TableCell className="text-muted-foreground">{record.period}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
