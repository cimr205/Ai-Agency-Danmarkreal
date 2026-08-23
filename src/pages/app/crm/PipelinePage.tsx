import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import PipelineStageEditor from '@/components/pipeline/PipelineStageEditor';
import { DealCoachPanel } from '@/components/deals/DealCoachPanel';
import { useDeals, useUpdateDeal, type DealWithCustomer } from '@/hooks/api/useDeals';
import { usePipelineStages } from '@/hooks/api/usePipelineStages';
import { useCustomers } from '@/hooks/api/useFinance';
import { Trophy, XCircle, Briefcase, Calendar, Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useCurrency } from '@/contexts/CurrencyContext';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const DEFAULT_STAGES = [
  { name: 'Discovery', color: '#3B82F6' },
  { name: 'Proposal', color: '#F59E0B' },
  { name: 'Negotiation', color: '#8B5CF6' },
  { name: 'Won', color: '#22C55E' },
  { name: 'Lost', color: '#EF4444' },
];

const stageLabels: Record<string, Record<string, string>> = {
  en: { discovery: 'Discovery', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' },
  da: { discovery: 'Opdagelse', proposal: 'Tilbud', negotiation: 'Forhandling', won: 'Vundet', lost: 'Tabt' },
  de: { discovery: 'Entdeckung', proposal: 'Angebot', negotiation: 'Verhandlung', won: 'Gewonnen', lost: 'Verloren' },
};

const normalizeStageKey = (stage?: string | null) => stage?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';

export default function PipelinePage() {
  const { t, locale } = useI18n();
  const { format: formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const [selectedDeal, setSelectedDeal] = useState<DealWithCustomer | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: dealsData, isLoading } = useDeals();
  const { data: customStages } = usePipelineStages();
  const { data: customers } = useCustomers();
  const updateDeal = useUpdateDeal();
  const notesPlaceholder = locale === 'da'
    ? 'Tilføj næste skridt, indvendinger og kontekst...'
    : locale === 'de'
      ? 'Nächste Schritte, Einwände und Kontext hinzufügen...'
      : 'Add next steps, objections, and context...';

  const deals = dealsData ?? [];

  const getWonValidationMessage = () => locale === 'da'
    ? 'Tilknyt en kunde og vælg forventet lukkedato, før dealen kan markeres som vundet.'
    : locale === 'de'
      ? 'Verknüpfe zuerst einen Kunden und ein erwartetes Abschlussdatum, bevor der Deal gewonnen werden kann.'
      : 'Link a customer and set an expected close date before marking the deal as won.';

  const canMarkDealWon = (deal?: { customer_id?: string | null; expected_close_date?: string | null } | null) => {
    return Boolean(deal?.customer_id && deal?.expected_close_date);
  };

  // Build stages from custom pipeline_stages or fallback
  const stages = useMemo(() => {
    if (customStages && customStages.length > 0) {
      return customStages.map(s => ({
        key: normalizeStageKey(s.name),
        label: stageLabels[locale]?.[normalizeStageKey(s.name)] || s.name,
        color: s.color || '#3B82F6',
      }));
    }
    return DEFAULT_STAGES.map(s => ({
      key: s.name.toLowerCase(),
      label: stageLabels[locale]?.[s.name.toLowerCase()] || s.name,
      color: s.color,
    }));
  }, [customStages, locale]);

  // Group deals by stage
  const kanbanGroups = useMemo(() => {
    const groups: Record<string, DealWithCustomer[]> = {};
    stages.forEach(s => { groups[s.key] = []; });
    deals.forEach(deal => {
      const key = normalizeStageKey(deal.stage) || 'discovery';
      if (groups[key]) {
        groups[key].push(deal);
      } else {
        // Put unmatched deals in first stage
        const first = stages[0]?.key;
        if (first && groups[first]) groups[first].push(deal);
      }
    });
    return groups;
  }, [deals, stages]);

  // Stats
  const totalValue = deals.reduce((sum, d) => sum + Number(d.value || 0), 0);
  const wonValue = deals.filter(d => normalizeStageKey(d.stage) === 'won').reduce((sum, d) => sum + Number(d.value || 0), 0);
  const activeDeals = deals.filter(d => !['won', 'lost'].includes(normalizeStageKey(d.stage))).length;

  const handleDrop = async (dealId: string, newStage: string) => {
    const targetDeal = selectedDeal?.id === dealId ? selectedDeal : deals.find((deal) => deal.id === dealId);
    if (normalizeStageKey(newStage) === 'won' && !canMarkDealWon(targetDeal)) {
      toast.error(getWonValidationMessage());
      return;
    }

    try {
      await updateDeal.mutateAsync({ id: dealId, stage: newStage });
      toast.success(locale === 'da' ? 'Deal flyttet' : locale === 'de' ? 'Deal verschoben' : 'Deal moved');
    } catch {
      toast.error(locale === 'da' ? 'Kunne ikke flytte deal' : 'Failed to move deal');
    }
  };

  const handleStageChange = async (dealId: string, stage: string) => {
    const targetDeal = selectedDeal?.id === dealId ? selectedDeal : deals.find((deal) => deal.id === dealId);
    if (normalizeStageKey(stage) === 'won' && !canMarkDealWon(targetDeal)) {
      toast.error(getWonValidationMessage());
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('pipeline.title')}</h1>
          <p className="text-muted-foreground">{t('pipeline.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <PipelineStageEditor />
          <Button onClick={() => navigate(`/${locale}/app/crm/deals?create=true`)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('pages.deals.newDeal')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t('pages.deals.totalDeals')}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{deals.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{locale === 'da' ? 'Aktive deals' : 'Active Deals'}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-primary">{activeDeals}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t('pages.deals.pipelineValue')}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(totalValue)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t('pages.deals.wonValue')}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-accent">{formatCurrency(wonValue)}</div></CardContent>
        </Card>
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="min-w-[240px] flex-1 h-48 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Briefcase className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('pages.deals.emptyTitle')}</h3>
            <p className="text-muted-foreground mb-4 max-w-md">{t('pages.deals.emptyDesc')}</p>
            <Button onClick={() => navigate(`/${locale}/app/crm/deals?create=true`)}>
              <Plus className="h-4 w-4 mr-2" />{t('pages.deals.createFirst')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map(stage => (
            <div
              key={stage.key}
              className="min-w-[240px] flex-1"
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('bg-primary/5'); }}
              onDragLeave={e => e.currentTarget.classList.remove('bg-primary/5')}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.classList.remove('bg-primary/5');
                const dealId = e.dataTransfer.getData('dealId');
                if (dealId) handleDrop(dealId, stage.key);
              }}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-semibold">{stage.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-xs">{kanbanGroups[stage.key]?.length || 0}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency((kanbanGroups[stage.key] || []).reduce((sum, d) => sum + Number(d.value || 0), 0))}
                  </span>
                </div>
              </div>
              <div className="space-y-2 min-h-[120px] rounded-lg border border-dashed border-border p-2 transition-colors">
                {kanbanGroups[stage.key]?.map(deal => (
                  <Card
                    key={deal.id}
                    className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('dealId', deal.id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onClick={() => { setSelectedDeal(deal); setDetailOpen(true); }}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="font-medium text-sm truncate">{deal.title}</p>
                      </div>
                      {deal.customers?.name && (
                        <p className="text-xs text-muted-foreground truncate ml-5.5">{deal.customers.name}</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-sm font-semibold text-primary">
                          {formatCurrency(Number(deal.value || 0))}
                        </span>
                        {deal.expected_close_date && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {new Date(deal.expected_close_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {(!kanbanGroups[stage.key] || kanbanGroups[stage.key].length === 0) && (
                  <div className="text-center py-8 text-xs text-muted-foreground">
                    {locale === 'da' ? 'Træk deals hertil' : locale === 'de' ? 'Deals hierher ziehen' : 'Drop deals here'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Deal Detail Sheet */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedDeal && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  {selectedDeal.title}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-6">
                <div>
                  <Label className="text-xs text-muted-foreground">{t('pages.deals.value')}</Label>
                  <p className="text-xl font-bold text-primary">{formatCurrency(Number(selectedDeal.value || 0))}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t('pages.deals.stage')}</Label>
                  <Select value={selectedDeal.stage} onValueChange={v => handleStageChange(selectedDeal.id, v)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {stages.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t('pages.deals.customer')}</Label>
                  {selectedDeal.customers?.name ? (
                    <p className="text-sm">{selectedDeal.customers?.name}</p>
                  ) : (
                    <Select
                      value=""
                      onValueChange={async (value) => {
                        const customer = (customers ?? []).find((entry) => entry.id === value);
                        if (!customer) return;
                        try {
                          await updateDeal.mutateAsync({ id: selectedDeal.id, customer_id: value });
                          setSelectedDeal({ ...selectedDeal, customer_id: value, customers: customer });
                          toast.success(locale === 'da' ? 'Kunde tilknyttet' : 'Customer linked');
                        } catch {
                          toast.error(t('common.error'));
                        }
                      }}
                    >
                      <SelectTrigger className="mt-1"><SelectValue placeholder={locale === 'da' ? 'Vælg kunde' : 'Select customer'} /></SelectTrigger>
                      <SelectContent>
                        {(customers ?? []).map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>{customer.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t('pages.deals.expectedClose')}</Label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={selectedDeal.expected_close_date || ''}
                    onChange={async (event) => {
                      const value = event.target.value || null;
                      try {
                        await updateDeal.mutateAsync({ id: selectedDeal.id, expected_close_date: value });
                        setSelectedDeal({ ...selectedDeal, expected_close_date: value });
                      } catch {
                        toast.error(t('common.error'));
                      }
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t('pages.deals.notesLabel')}</Label>
                  <Textarea
                    defaultValue={selectedDeal.notes || ''}
                    placeholder={notesPlaceholder}
                    onBlur={e => {
                      if (e.target.value !== (selectedDeal.notes || '')) handleNotesUpdate(selectedDeal.id, e.target.value);
                    }}
                    rows={4}
                    className="mt-1"
                  />
                </div>
                <div className="flex gap-2">
                  {selectedDeal.stage !== 'won' && (
                    <Button className="flex-1 bg-accent hover:bg-accent/90" onClick={() => handleStageChange(selectedDeal.id, 'won')} disabled={!canMarkDealWon(selectedDeal)}>
                      <Trophy className="h-4 w-4 mr-2" />{locale === 'da' ? 'Marker som vundet' : 'Mark as Won'}
                    </Button>
                  )}
                  {selectedDeal.stage !== 'lost' && (
                    <Button variant="destructive" className="flex-1" onClick={() => handleStageChange(selectedDeal.id, 'lost')}>
                      <XCircle className="h-4 w-4 mr-2" />{locale === 'da' ? 'Marker som tabt' : 'Mark as Lost'}
                    </Button>
                  )}
                </div>
                <DealCoachPanel dealId={selectedDeal.id} dealTitle={selectedDeal.title} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
