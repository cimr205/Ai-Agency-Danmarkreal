import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DealCoachPanel } from '@/components/deals/DealCoachPanel';
import { MeetingSummaryDialog } from '@/components/deals/MeetingSummaryDialog';
import { useDeals, useCreateDeal, useUpdateDeal, type DealWithCustomer } from '@/hooks/api/useDeals';
import { usePipelineStages } from '@/hooks/api/usePipelineStages';
import { useCustomers } from '@/hooks/api/useFinance';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, Briefcase, DollarSign, Trophy, XCircle, Calendar, LayoutGrid, List, FileText, Mic } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { useCurrency } from '@/contexts/CurrencyContext';

type DealStage = string;

const DEFAULT_STAGES: DealStage[] = ['discovery', 'proposal', 'negotiation', 'won', 'lost'];

const stageColors: Record<string, string> = {
  discovery: 'bg-primary/15 text-primary border-primary/30',
  proposal: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  negotiation: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  won: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  lost: 'bg-destructive/15 text-destructive border-destructive/30',
};

const stageLabels: Record<string, Record<string, string>> = {
  en: { discovery: 'Discovery', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' },
  da: { discovery: 'Opdagelse', proposal: 'Tilbud', negotiation: 'Forhandling', won: 'Vundet', lost: 'Tabt' },
  de: { discovery: 'Entdeckung', proposal: 'Angebot', negotiation: 'Verhandlung', won: 'Gewonnen', lost: 'Verloren' },
};

const normalizeStageKey = (stage?: string | null) => stage?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';

export default function DealsPage() {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<DealWithCustomer | null>(null);
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [newDeal, setNewDeal] = useState({ title: '', value: '', stage: 'discovery' as DealStage, customer_id: '', expected_close_date: '', notes: '' });
  const [meetingSummaryOpen, setMeetingSummaryOpen] = useState(false);
  const [meetingSummaryDealId, setMeetingSummaryDealId] = useState<string | undefined>();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data, isLoading, error } = useDeals();
  const { data: pipelineStages } = usePipelineStages();
  const { data: customers } = useCustomers();
  const createDeal = useCreateDeal();
  const updateDeal = useUpdateDeal();
  const notesPlaceholder = locale === 'da'
    ? 'Tilføj næste skridt, indvendinger og kontekst...'
    : locale === 'de'
      ? 'Nächste Schritte, Einwände und Kontext hinzufügen...'
      : 'Add next steps, objections, and context...';

  // Use dynamic pipeline stages if available, else fallback to defaults
  const STAGES: DealStage[] = useMemo(() => {
    if (pipelineStages && pipelineStages.length > 0) {
      return pipelineStages.map(s => s.name.toLowerCase().replace(/\s+/g, '_'));
    }
    return DEFAULT_STAGES;
  }, [pipelineStages]);

  const getStageLabel = (stage: string) => {
    // First check if it's a custom pipeline stage
    const customStage = pipelineStages?.find(s => s.name.toLowerCase().replace(/\s+/g, '_') === stage);
    if (customStage) return customStage.name;
    // Fallback to translated default labels
    return stageLabels[locale]?.[stage] || stageLabels.en[stage] || stage;
  };

  const getWonValidationMessage = () => locale === 'da'
    ? 'Tilknyt en kunde og vælg forventet lukkedato, før dealen kan markeres som vundet.'
    : locale === 'de'
      ? 'Verknüpfe zuerst einen Kunden und ein erwartetes Abschlussdatum, bevor der Deal gewonnen werden kann.'
      : 'Link a customer and set an expected close date before marking the deal as won.';

  const canMarkDealWon = (deal?: { customer_id?: string | null; expected_close_date?: string | null } | null) => {
    return Boolean(deal?.customer_id && deal?.expected_close_date);
  };

  const deals = data ?? [];
  const filteredDeals = deals.filter(deal => deal.title.toLowerCase().includes(search.toLowerCase()));

  const totalValue = deals.reduce((sum, d) => sum + Number(d.value || 0), 0);
  const totalDeals = deals.length;
  const wonValue = deals.filter(d => d.stage === 'won').reduce((sum, d) => sum + Number(d.value || 0), 0);

  const { format: formatCurrency } = useCurrency();

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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
  }, [searchParams, setSearchParams]);

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
      toast.error(getWonValidationMessage());
      return;
    }

    try {
      await updateDeal.mutateAsync({ id: dealId, stage });
      toast.success(t('pages.deals.stageUpdated'));
      if (selectedDeal?.id === dealId) setSelectedDeal((d) => d ? { ...d, stage } : d);
    } catch { toast.error(t('pages.deals.created_error')); }
  };

  const handleNotesUpdate = async (dealId: string, notes: string) => {
    try {
      await updateDeal.mutateAsync({ id: dealId, notes });
      toast.success(t('common.saved'));
    } catch { toast.error(t('common.error')); }
  };

  // Kanban grouped
  const kanbanGroups = useMemo(() => {
    const groups: Record<string, typeof deals> = {};
    STAGES.forEach(s => { groups[s] = []; });
    filteredDeals.forEach(d => {
      if (groups[d.stage]) groups[d.stage].push(d);
    });
    return groups;
  }, [filteredDeals, STAGES]);

  const isEmpty = !isLoading && deals.length === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pages.deals.title')}</h1>
          <p className="text-muted-foreground">{t('pages.deals.subtitle')}</p>
        </div>
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
                    <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{getStageLabel(s)}</SelectItem>)}</SelectContent>
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
                <div className="space-y-2"><Label>{t('pages.deals.notesLabel')}</Label><Textarea value={newDeal.notes} onChange={e => setNewDeal({ ...newDeal, notes: e.target.value })} placeholder={notesPlaceholder} rows={3} /></div>
              <Button onClick={handleCreate} disabled={createDeal.isPending} className="w-full">{createDeal.isPending ? t('pages.deals.creating') : t('pages.deals.createCta')}</Button>
            </div>
          </DialogContent>
        </Dialog>
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

      {/* Stats */}
      {!isEmpty && (
        <>
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
            <div className="flex gap-1 border rounded-md">
              <Button variant={view === 'table' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('table')}><List className="h-4 w-4" /></Button>
              <Button variant={view === 'kanban' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('kanban')}><LayoutGrid className="h-4 w-4" /></Button>
            </div>
          </div>

          {/* Table View */}
          {view === 'table' && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('pages.deals.titleLabel')}</TableHead>
                      <TableHead>{t('pages.deals.customer')}</TableHead>
                      <TableHead>{t('pages.deals.value')}</TableHead>
                      <TableHead>{t('pages.deals.stage')}</TableHead>
                      <TableHead>{t('pages.deals.expectedClose')}</TableHead>
                      <TableHead>{t('pages.deals.created')}</TableHead>
                      <TableHead className="text-right">{t('pages.deals.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                    )) : filteredDeals.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{error ? t('pages.deals.fetchError') : t('pages.deals.empty')}</TableCell></TableRow>
                    ) : filteredDeals.map(deal => (
                      <TableRow key={deal.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedDeal(deal)}>
                        <TableCell className="font-medium"><div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground" />{deal.title}</div></TableCell>
                        <TableCell className="text-muted-foreground">{deal.customers?.name || '—'}</TableCell>
                        <TableCell><span className="font-medium">{formatCurrency(deal.value)}</span></TableCell>
                        <TableCell><Badge variant="outline" className={stageColors[deal.stage] || ''}>{getStageLabel(deal.stage)}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{deal.expected_close_date ? new Date(deal.expected_close_date).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{deal.created_at ? new Date(deal.created_at).toLocaleDateString() : '—'}</TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {deal.stage !== 'won' && <Button variant="ghost" size="sm" className="text-emerald-600" onClick={() => handleStageChange(deal.id, 'won')}><Trophy className="h-3.5 w-3.5" /></Button>}
                            {deal.stage !== 'lost' && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleStageChange(deal.id, 'lost')}><XCircle className="h-3.5 w-3.5" /></Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Kanban View */}
          {view === 'kanban' && (
            <div className="flex gap-3 overflow-x-auto pb-4" style={{ gridTemplateColumns: `repeat(${STAGES.length}, minmax(220px, 1fr))` }}>
              {STAGES.map(stage => (
                <div key={stage} className="min-w-[220px]">
                  <div className="flex items-center justify-between mb-3">
                    <Badge variant="outline" className={stageColors[stage]}>{getStageLabel(stage)}</Badge>
                    <span className="text-xs text-muted-foreground">{kanbanGroups[stage]?.length || 0}</span>
                  </div>
                  <div className="space-y-2">
                    {kanbanGroups[stage]?.map(deal => (
                      <Card key={deal.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedDeal(deal)}>
                        <CardContent className="p-3">
                          <p className="font-medium text-sm truncate">{deal.title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{deal.customers?.name}</p>
                          <p className="text-sm font-semibold mt-2">{formatCurrency(deal.value)}</p>
                          {deal.expected_close_date && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(deal.expected_close_date).toLocaleDateString()}</p>
                          )}
                          <div className="flex gap-1 mt-2">
                            {deal.stage !== 'won' && <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-emerald-600" onClick={e => { e.stopPropagation(); handleStageChange(deal.id, 'won'); }}><Trophy className="h-3 w-3 mr-1" />{getStageLabel('won')}</Button>}
                            {deal.stage !== 'lost' && <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-destructive" onClick={e => { e.stopPropagation(); handleStageChange(deal.id, 'lost'); }}><XCircle className="h-3 w-3 mr-1" />{getStageLabel('lost')}</Button>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    {(!kanbanGroups[stage] || kanbanGroups[stage].length === 0) && (
                      <div className="border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">{t('pages.deals.empty')}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Deal Detail Sheet */}
      <Sheet open={!!selectedDeal} onOpenChange={open => { if (!open) setSelectedDeal(null); }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedDeal && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5" />{selectedDeal.title}</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('pages.deals.value')}</Label>
                    <p className="text-lg font-bold">{formatCurrency(selectedDeal.value)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('pages.deals.stage')}</Label>
                    <div className="mt-1">
                      <Select value={selectedDeal.stage} onValueChange={v => handleStageChange(selectedDeal.id, v as DealStage)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s}>{getStageLabel(s)}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">{t('pages.deals.customer')}</Label>
                  {selectedDeal.customers?.name ? (
                    <p className="font-medium">{selectedDeal.customers.name}</p>
                  ) : (
                    <div className="mt-1">
                      <Select
                        value=""
                        onValueChange={v => {
                          if (!v) return;
                          updateDeal.mutate({ id: selectedDeal.id, customer_id: v });
                          const cust = customers?.find(c => c.id === v);
                          setSelectedDeal({ ...selectedDeal, customer_id: v, customers: cust || null });
                          toast.success(locale === 'da' ? 'Kontakt tilknyttet' : 'Contact linked');
                        }}
                      >
                        <SelectTrigger className="h-8"><SelectValue placeholder={locale === 'da' ? 'Vælg kontakt...' : 'Link a contact...'} /></SelectTrigger>
                        <SelectContent>
                          {(customers ?? []).map(c => <SelectItem key={c.id} value={c.id}>{c.name} — {c.email}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">{t('pages.deals.expectedClose')}</Label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={selectedDeal.expected_close_date || ''}
                    onChange={e => {
                      const val = e.target.value || null;
                      updateDeal.mutate({ id: selectedDeal.id, expected_close_date: val });
                      setSelectedDeal({ ...selectedDeal, expected_close_date: val });
                    }}
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">{t('pages.deals.created')}</Label>
                  <p>{new Date(selectedDeal.created_at).toLocaleDateString()}</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t('pages.deals.notesLabel')}</Label>
                  <Textarea
                    defaultValue={selectedDeal.notes || ''}
                    placeholder={notesPlaceholder}
                    rows={4}
                    onBlur={e => {
                      if (e.target.value !== (selectedDeal.notes || '')) handleNotesUpdate(selectedDeal.id, e.target.value);
                    }}
                  />
                </div>

                {/* AI Deal Coach */}
                <DealCoachPanel dealId={selectedDeal.id} dealTitle={selectedDeal.title} />

                {/* Meeting Summary button */}
                <Button variant="outline" className="w-full gap-2" onClick={() => { setMeetingSummaryDealId(selectedDeal.id); setMeetingSummaryOpen(true); }}>
                  <Mic className="h-4 w-4" /> {locale === 'da' ? 'AI Mødeopsummering' : 'AI Meeting Summary'}
                </Button>

                <div className="flex gap-2">
                  {selectedDeal.stage !== 'won' && (
                    <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleStageChange(selectedDeal.id, 'won')} disabled={!canMarkDealWon(selectedDeal)}>
                      <Trophy className="h-4 w-4 mr-2" />{t('pages.deals.markWon')}
                    </Button>
                  )}
                  {selectedDeal.stage !== 'lost' && (
                    <Button variant="destructive" className="flex-1" onClick={() => handleStageChange(selectedDeal.id, 'lost')}>
                      <XCircle className="h-4 w-4 mr-2" />{t('pages.deals.markLost')}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Meeting Summary Dialog */}
      <MeetingSummaryDialog
        open={meetingSummaryOpen}
        onOpenChange={setMeetingSummaryOpen}
        dealId={meetingSummaryDealId}
      />
    </div>
  );
}
