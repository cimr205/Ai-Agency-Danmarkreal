import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDeals, useCreateDeal, useUpdateDeal, type DealWithCustomer } from '@/hooks/api/useDeals';
import { usePipelineStages } from '@/hooks/api/usePipelineStages';
import { useCustomers } from '@/hooks/api/useFinance';
import PipelineStageEditor from '@/components/pipeline/PipelineStageEditor';
import { DealViewSwitcher, type DealView } from '@/components/deals/DealViewSwitcher';
import { DealBoardView } from '@/components/deals/DealBoardView';
import { DealListView } from '@/components/deals/DealListView';
import { DealCalendarView } from '@/components/deals/DealCalendarView';
import { DealDetailSheet } from '@/components/deals/DealDetailSheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Briefcase } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { useCurrency } from '@/contexts/CurrencyContext';
import { buildStages, getStageLabelFor, normalizeStageKey, type StageDef } from '@/lib/deals/stages';
import { canMarkDealWon, getWonValidationMessage } from '@/lib/deals/wonValidation';

type DealStage = string;

export default function DealsPage() {
  const { t, locale } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<DealWithCustomer | null>(null);
  const [newDeal, setNewDeal] = useState({ title: '', value: '', stage: 'discovery' as DealStage, customer_id: '', expected_close_date: '', notes: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const view = (searchParams.get('view') as DealView) || 'board';
  const setView = (next: DealView) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', next);
    setSearchParams(params, { replace: true });
  };

  const { data, isLoading, error } = useDeals();
  const { data: pipelineStages } = usePipelineStages();
  const { data: customers } = useCustomers();
  const createDeal = useCreateDeal();
  const updateDeal = useUpdateDeal();
  const { format: formatCurrency } = useCurrency();

  const stages: StageDef[] = useMemo(() => buildStages(pipelineStages, locale), [pipelineStages, locale]);
  const getStageLabel = (stage: string) => getStageLabelFor(stage, locale, pipelineStages);

  const deals = data ?? [];
  const filteredDeals = deals.filter(deal => deal.title.toLowerCase().includes(search.toLowerCase()));
  const isEmpty = !isLoading && deals.length === 0;

  const totalValue = deals.reduce((sum, d) => sum + Number(d.value || 0), 0);
  const totalDeals = deals.length;
  const wonValue = deals.filter(d => normalizeStageKey(d.stage) === 'won').reduce((sum, d) => sum + Number(d.value || 0), 0);

  useEffect(() => {
    if (searchParams.get('create') !== 'true') return;

    const leadName = searchParams.get('leadName');
    const leadValue = searchParams.get('leadValue');
    const customerId = searchParams.get('customer');

    setNewDeal((current) => ({
      ...current,
      title: current.title || leadName || '',
      value: current.value || (leadValue && Number(leadValue) > 0 ? leadValue : ''),
      customer_id: current.customer_id || customerId || '',
    }));
    setIsCreateOpen(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('create');
    nextParams.delete('leadName');
    nextParams.delete('leadValue');
    nextParams.delete('customer');
    setSearchParams(nextParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleCreate = async () => {
    const errors: Record<string, string> = {};
    if (!newDeal.title.trim()) errors.title = t('pages.deals.titleRequired') || 'Title is required';
    if (!newDeal.value || isNaN(parseFloat(newDeal.value)) || parseFloat(newDeal.value) <= 0) errors.value = t('pages.deals.valueRequired') || 'Value is required';
    if ((customers ?? []).length === 0) errors.customer_id = locale === 'da' ? 'Opret mindst én kunde før du opretter en deal' : 'Create at least one customer before creating a deal';
    else if (!newDeal.customer_id || newDeal.customer_id === 'none') errors.customer_id = locale === 'da' ? 'Kunde er påkrævet' : 'Customer is required';
    if (!newDeal.expected_close_date) errors.expected_close_date = locale === 'da' ? 'Forventet lukkedato er påkrævet' : 'Expected close date is required';
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    try {
      await createDeal.mutateAsync({
        title: newDeal.title,
        value: parseFloat(newDeal.value),
        stage: newDeal.stage,
        customer_id: newDeal.customer_id,
        expected_close_date: newDeal.expected_close_date,
        notes: newDeal.notes || undefined,
      });
      toast.success(t('pages.deals.created_success'));
      setNewDeal({ title: '', value: '', stage: 'discovery', customer_id: '', expected_close_date: '', notes: '' });
      setIsCreateOpen(false);
    } catch (err) {
      console.error('Deal creation error:', err);
      toast.error(t('pages.deals.created_error'));
    }
  };

  const handleStageChange = async (dealId: string, stage: DealStage) => {
    const targetDeal = selectedDeal?.id === dealId ? selectedDeal : deals.find((deal) => deal.id === dealId);
    if (normalizeStageKey(stage) === 'won' && !canMarkDealWon(targetDeal)) {
      toast.error(getWonValidationMessage(locale));
      return;
    }
    try {
      await updateDeal.mutateAsync({ id: dealId, stage });
      toast.success(t('pages.deals.stageUpdated'));
      if (selectedDeal?.id === dealId) setSelectedDeal((d) => d ? { ...d, stage } : d);
    } catch { toast.error(t('common.error')); }
  };

  const handleNotesUpdate = async (dealId: string, notes: string) => {
    try {
      await updateDeal.mutateAsync({ id: dealId, notes });
      toast.success(t('common.saved'));
    } catch { toast.error(t('common.error')); }
  };

  const handleCustomerLink = async (dealId: string, customerId: string) => {
    try {
      await updateDeal.mutateAsync({ id: dealId, customer_id: customerId });
      const cust = customers?.find(c => c.id === customerId);
      if (selectedDeal?.id === dealId) setSelectedDeal({ ...selectedDeal, customer_id: customerId, customers: cust || null });
    } catch { toast.error(t('common.error')); }
  };

  const handleExpectedCloseChange = async (dealId: string, value: string | null) => {
    try {
      await updateDeal.mutateAsync({ id: dealId, expected_close_date: value });
      if (selectedDeal?.id === dealId) setSelectedDeal({ ...selectedDeal, expected_close_date: value });
    } catch { toast.error(t('common.error')); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pages.deals.title')}</h1>
          <p className="text-muted-foreground">{t('pages.deals.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <PipelineStageEditor />
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />{t('pages.deals.newDeal')}</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{t('pages.deals.createTitle')}</DialogTitle><DialogDescription>{t('pages.deals.createSubtitle')}</DialogDescription></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('pages.deals.titleLabel')} *</Label>
                  <Input value={newDeal.title} onChange={e => { setNewDeal({ ...newDeal, title: e.target.value }); setFormErrors(prev => ({ ...prev, title: '' })); }} placeholder={t('pages.deals.titlePlaceholder')} className={formErrors.title ? 'border-destructive' : ''} />
                  {formErrors.title && <p className="text-xs text-destructive">{formErrors.title}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('pages.deals.value')} *</Label>
                    <Input type="number" value={newDeal.value} onChange={e => { setNewDeal({ ...newDeal, value: e.target.value }); setFormErrors(prev => ({ ...prev, value: '' })); }} placeholder={t('pages.deals.valuePlaceholder')} className={formErrors.value ? 'border-destructive' : ''} />
                    {formErrors.value && <p className="text-xs text-destructive">{formErrors.value}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>{t('pages.deals.stage')}</Label>
                    <Select value={newDeal.stage} onValueChange={v => setNewDeal({ ...newDeal, stage: v as DealStage })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{stages.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>{t('pages.deals.customer')} *</Label>
                  <Select value={newDeal.customer_id} onValueChange={v => { setNewDeal({ ...newDeal, customer_id: v }); setFormErrors(prev => ({ ...prev, customer_id: '' })); }}>
                    <SelectTrigger className={formErrors.customer_id ? 'border-destructive' : ''}><SelectValue placeholder={locale === 'da' ? 'Vælg kunde' : 'Select customer'} /></SelectTrigger>
                    <SelectContent>
                      {(customers ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {(customers ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      {locale === 'da' ? 'Du skal oprette en kunde først, før en deal kan gemmes.' : 'You need to create a customer before a deal can be saved.'}
                    </p>
                  )}
                  {formErrors.customer_id && <p className="text-xs text-destructive">{formErrors.customer_id}</p>}
                </div>
                <div className="space-y-2">
                  <Label>{t('pages.deals.expectedClose')} *</Label>
                  <Input type="date" value={newDeal.expected_close_date} onChange={e => { setNewDeal({ ...newDeal, expected_close_date: e.target.value }); setFormErrors(prev => ({ ...prev, expected_close_date: '' })); }} className={formErrors.expected_close_date ? 'border-destructive' : ''} />
                  {formErrors.expected_close_date && <p className="text-xs text-destructive">{formErrors.expected_close_date}</p>}
                </div>
                <div className="space-y-2"><Label>{t('pages.deals.notesLabel')}</Label><Textarea value={newDeal.notes} onChange={e => setNewDeal({ ...newDeal, notes: e.target.value })} placeholder={locale === 'da' ? 'Tilføj næste skridt, indvendinger og kontekst...' : 'Add next steps, objections, and context...'} rows={3} /></div>
                <Button onClick={handleCreate} disabled={createDeal.isPending} className="w-full">{createDeal.isPending ? t('pages.deals.creating') : t('pages.deals.createCta')}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Empty state onboarding */}
      {isEmpty && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('pages.deals.emptyTitle')}</h3>
            <p className="text-muted-foreground mb-4 max-w-md">{t('pages.deals.emptyDesc')}</p>
            <Button onClick={() => setIsCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />{t('pages.deals.createFirst')}</Button>
          </CardContent>
        </Card>
      )}

      {!isEmpty && (
        <>
          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t('pages.deals.totalDeals')}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{totalDeals}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t('pages.deals.pipelineValue')}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-primary">{formatCurrency(totalValue)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t('pages.deals.wonValue')}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(wonValue)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t('pages.deals.avgDealValue')}</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(totalDeals ? totalValue / totalDeals : 0)}</div></CardContent></Card>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder={t('pages.deals.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <DealViewSwitcher view={view} onChange={setView} />
          </div>

          {isLoading ? (
            <div className="flex gap-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="min-w-[240px] flex-1 h-48 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : view === 'board' ? (
            <DealBoardView
              deals={filteredDeals}
              stages={stages}
              locale={locale}
              formatCurrency={formatCurrency}
              onSelectDeal={setSelectedDeal}
              onDrop={handleStageChange}
            />
          ) : view === 'calendar' ? (
            <DealCalendarView deals={filteredDeals} onSelectDeal={setSelectedDeal} formatCurrency={formatCurrency} />
          ) : (
            <DealListView
              deals={filteredDeals}
              isLoading={isLoading}
              error={error}
              t={t}
              formatCurrency={formatCurrency}
              getStageLabel={getStageLabel}
              onSelectDeal={setSelectedDeal}
              onMarkWon={id => handleStageChange(id, 'won')}
              onMarkLost={id => handleStageChange(id, 'lost')}
              onCreate={() => setIsCreateOpen(true)}
            />
          )}
        </>
      )}

      <DealDetailSheet
        deal={selectedDeal}
        open={!!selectedDeal}
        onOpenChange={open => { if (!open) setSelectedDeal(null); }}
        stages={stages}
        customers={customers}
        locale={locale}
        t={t}
        formatCurrency={formatCurrency}
        onStageChange={handleStageChange}
        onCustomerLink={handleCustomerLink}
        onExpectedCloseChange={handleExpectedCloseChange}
        onNotesUpdate={handleNotesUpdate}
        onMarkWon={id => handleStageChange(id, 'won')}
        onMarkLost={id => handleStageChange(id, 'lost')}
      />
    </div>
  );
}
