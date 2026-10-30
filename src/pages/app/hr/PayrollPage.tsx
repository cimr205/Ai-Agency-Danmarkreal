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
import { Plus, Search, Banknote, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { EmptyState } from '@/components/shared/EmptyState';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { da, de, enUS } from 'date-fns/locale';
import { useI18n } from '@/lib/i18n';
import { WorkspaceFrame, WorkspaceGradientSurface } from '@/components/workspace/WorkspacePanel';
import { WorkspaceTile } from '@/components/workspace/Tile';
import { supabase } from '@/integrations/supabase/client';
import { t3 } from '@/lib/inlineI18n';

// QA #89: payroll used to be a single number with no deductions. This is a
// bounded first version — a gross-to-net ESTIMATE using adjustable Danish
// default rates. It is explicitly not an authorised payroll calculation.
const AM_RATE = 0.08;        // AM-bidrag (labour-market contribution), statutory 8%
const DEFAULT_TAX_RATE = 38; // A-skat, % of the AM-reduced base — adjustable per employee
const ATP_EMPLOYEE = 99;     // ATP employee share, DKK/month (full-time, approx.)

function computePayrollBreakdown(gross: number, taxPct: number, pensionPct: number) {
  const amContribution = Math.round(gross * AM_RATE * 100) / 100;
  const pension = Math.round(gross * (pensionPct / 100) * 100) / 100;
  const taxableBase = Math.max(0, gross - amContribution - pension);
  const incomeTax = Math.round(taxableBase * (taxPct / 100) * 100) / 100;
  const atp = gross > 0 ? ATP_EMPLOYEE : 0;
  const net = Math.round((gross - amContribution - pension - incomeTax - atp) * 100) / 100;
  // Holiday pay (feriepenge) is accrued by the employer on top — shown for
  // information, not deducted from net.
  const holidayAccrual = Math.round(gross * 0.125 * 100) / 100;
  return { gross, amContribution, pension, taxableBase, incomeTax, atp, net: Math.max(0, net), holidayAccrual };
}

const DATE_LOCALES = { da, de, en: enUS } as const;
const LOCALE_CURRENCY: Record<string, { currency: string; locale: string }> = {
  da: { currency: 'DKK', locale: 'da-DK' },
  // The company pays in DKK regardless of UI language — switching the UI to
  // German used to relabel every salary as EUR.
  de: { currency: 'DKK', locale: 'de-DE' },
  en: { currency: 'DKK', locale: 'da-DK' },
};

export default function PayrollPage() {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newPayroll, setNewPayroll] = useState({ employee_id: '', salary: '', period: new Date().toISOString().slice(0, 7) });
  const [taxRate, setTaxRate] = useState(String(DEFAULT_TAX_RATE));
  const [pensionRate, setPensionRate] = useState('0');

  const dateFnsLocale = DATE_LOCALES[locale] || enUS;
  const currConfig = LOCALE_CURRENCY[locale] || LOCALE_CURRENCY.da;
  const formatCurrency = useCallback((amount: number) =>
    new Intl.NumberFormat(currConfig.locale, { style: 'currency', currency: currConfig.currency }).format(amount), [currConfig]);

  const currentPeriod = format(new Date(), 'yyyy-MM');
  const { data, isLoading, error } = usePayroll({ period: currentPeriod });
  const createPayroll = useCreatePayroll();
  const queryClient = useQueryClient();
  const { data: employees } = useEmployees();

  const handleCreate = async () => {
    if (!newPayroll.employee_id || !newPayroll.salary || !newPayroll.period) { toast.error(t('hr.allFieldsRequired')); return; }
    const salary = parseFloat(newPayroll.salary.replace(',', '.'));
    if (!(salary > 0)) { toast.error(t('hr.salaryPositive')); return; }
    // One payroll record per employee per period — registering twice used
    // to double the month's total silently.
    const { data: existing } = await supabase
      .from('payroll')
      .select('id')
      .eq('employee_profile_id', newPayroll.employee_id)
      .eq('period', newPayroll.period)
      .limit(1);
    if (existing && existing.length > 0) { toast.error(t('hr.payrollDuplicate')); return; }
    const b = computePayrollBreakdown(salary, parseFloat(taxRate.replace(',', '.')) || 0, parseFloat(pensionRate.replace(',', '.')) || 0);
    try {
      await createPayroll.mutateAsync({
        employee_profile_id: newPayroll.employee_id,
        base_salary: b.gross,
        deductions: Math.round((b.gross - b.net) * 100) / 100,
        net_salary: b.net,
        period: newPayroll.period,
      });
      toast.success(t('hr.payrollRegistered'));
      setNewPayroll({ employee_id: '', salary: '', period: new Date().toISOString().slice(0, 7) });
      setTaxRate(String(DEFAULT_TAX_RATE));
      setPensionRate('0');
      setIsCreateOpen(false);
    } catch { toast.error(t('hr.payrollRegisterError')); }
  };

  const grossForPreview = parseFloat((newPayroll.salary || '').replace(',', '.'));
  const previewBreakdown = grossForPreview > 0
    ? computePayrollBreakdown(grossForPreview, parseFloat(taxRate.replace(',', '.')) || 0, parseFloat(pensionRate.replace(',', '.')) || 0)
    : null;

  const payrolls = data ?? [];
  const filteredPayroll = payrolls.filter(record => (record.employee_profiles?.full_name || '').toLowerCase().includes(search.toLowerCase()));
  const totalSalary = payrolls.reduce((sum, p) => sum + Number(p.net_salary), 0);
  const avgSalary = payrolls.length ? totalSalary / payrolls.length : 0;

  return (
    <div className="workspace-theme space-y-6">
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
              <div className="space-y-2"><Label>{t3('Bruttoløn (md.)', 'Gross salary (month)', 'Bruttogehalt (Monat)')}</Label><Input type="number" value={newPayroll.salary} onChange={(e) => setNewPayroll({ ...newPayroll, salary: e.target.value })} placeholder="35000" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>{t3('A-skat %', 'Income tax %', 'Lohnsteuer %')}</Label><Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="38" /></div>
                <div className="space-y-2"><Label>{t3('Pension %', 'Pension %', 'Rente %')}</Label><Input type="number" value={pensionRate} onChange={(e) => setPensionRate(e.target.value)} placeholder="0" /></div>
              </div>
              <div className="space-y-2"><Label>{t('hr.periodLabel')}</Label><Input type="month" value={newPayroll.period} onChange={(e) => setNewPayroll({ ...newPayroll, period: e.target.value })} /></div>
              {previewBreakdown && (
                <div className="rounded-md border border-border bg-muted/40 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t3('Bruttoløn', 'Gross', 'Brutto')}</span><span>{formatCurrency(previewBreakdown.gross)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t3('AM-bidrag (8%)', 'Labour-market contribution (8%)', 'Arbeitsmarktbeitrag (8%)')}</span><span>−{formatCurrency(previewBreakdown.amContribution)}</span></div>
                  {previewBreakdown.pension > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t3('Pension', 'Pension', 'Rente')}</span><span>−{formatCurrency(previewBreakdown.pension)}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">{t3('A-skat', 'Income tax', 'Lohnsteuer')}</span><span>−{formatCurrency(previewBreakdown.incomeTax)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">ATP</span><span>−{formatCurrency(previewBreakdown.atp)}</span></div>
                  <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1"><span>{t3('Nettoløn', 'Net salary', 'Nettogehalt')}</span><span className="text-success">{formatCurrency(previewBreakdown.net)}</span></div>
                  <div className="flex justify-between text-xs text-muted-foreground"><span>{t3('Feriepenge hensat (12,5%)', 'Holiday pay accrued (12.5%)', 'Urlaubsgeld (12,5%)')}</span><span>{formatCurrency(previewBreakdown.holidayAccrual)}</span></div>
                  <p className="text-xs text-muted-foreground pt-1">{t3('Estimat — ikke en autoriseret lønberegning. Satser kan justeres ovenfor.', 'Estimate — not an authorised payroll calculation. Rates are adjustable above.', 'Schätzung — keine autorisierte Lohnabrechnung. Sätze oben anpassbar.')}</p>
                </div>
              )}
              <Button onClick={handleCreate} disabled={createPayroll.isPending} className="w-full">{createPayroll.isPending ? t('hr.registering') : t('hr.registerPayrollBtn')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <WorkspaceFrame>
        <WorkspaceGradientSurface className="p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <WorkspaceTile label={t('hr.totalSalaryMonth')} value={formatCurrency(totalSalary)} active />
            <WorkspaceTile label={t('hr.averageSalary')} value={formatCurrency(avgSalary)} />
            <WorkspaceTile label={t('hr.records')} value={payrolls.length} />
          </div>
        </WorkspaceGradientSurface>
      </WorkspaceFrame>

      <div className="flex items-center gap-4"><div className="relative flex-1 max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder={t('hr.searchEmployeePlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" /></div></div>

      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>{t('hr.employee')}</TableHead><TableHead>{t('hr.salary')}</TableHead><TableHead>{t('hr.period')}</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
          <TableBody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (<TableRow key={i}><TableCell><Skeleton className="h-4 w-32" /></TableCell><TableCell><Skeleton className="h-4 w-24" /></TableCell><TableCell><Skeleton className="h-4 w-24" /></TableCell></TableRow>))
            : filteredPayroll.length === 0 ? (<TableRow><TableCell colSpan={4}>
                <EmptyState
                  bare
                  icon={Banknote}
                  title={error ? t('hr.fetchPayrollError') : t('hr.noPayroll')}
                  hint={t('hr.payrollGuide') || 'Register monthly salary payments for employees. Click "Register Payroll" to add a salary record for the current period.'}
                  action={!error ? { label: t('hr.registerPayroll'), onClick: () => setIsCreateOpen(true), icon: Plus } : undefined}
                />
              </TableCell></TableRow>)
            : filteredPayroll.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="font-medium">{record.employee_profiles?.full_name || t('hr.unknown')}</TableCell>
                <TableCell className="font-medium text-success">{formatCurrency(record.net_salary)}</TableCell>
                <TableCell className="text-muted-foreground">{record.period}</TableCell>
                <TableCell className="text-right">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={t('common.delete')} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('hr.deletePayrollTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>{record.employee_profiles?.full_name} · {record.period} · {formatCurrency(record.net_salary)}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={async () => {
                          const { error: delErr } = await supabase.from('payroll').delete().eq('id', record.id);
                          if (delErr) { toast.error(t('common.error')); return; }
                          toast.success(t('common.deleted') || 'Deleted');
                          queryClient.invalidateQueries({ queryKey: ['payroll'] });
                        }}>{t('common.delete')}</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
