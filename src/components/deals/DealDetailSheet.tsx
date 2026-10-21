import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Briefcase, Trophy, XCircle, Mic } from 'lucide-react';
import { toast } from 'sonner';
import { DealCoachPanel } from '@/components/deals/DealCoachPanel';
import { MeetingSummaryDialog } from '@/components/deals/MeetingSummaryDialog';
import type { DealWithCustomer } from '@/hooks/api/useDeals';
import type { Tables } from '@/integrations/supabase/types';
import type { StageDef } from '@/lib/deals/stages';
import { canMarkDealWon } from '@/lib/deals/wonValidation';

type Customer = Tables<'customers'>;

export function DealDetailSheet({
  deal, open, onOpenChange, stages, customers, locale, t, formatCurrency,
  onStageChange, onCustomerLink, onExpectedCloseChange, onNotesUpdate, onMarkWon, onMarkLost,
}: {
  deal: DealWithCustomer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: StageDef[];
  customers: Customer[] | undefined;
  locale: string;
  t: (key: string) => string;
  formatCurrency: (n: number) => string;
  onStageChange: (dealId: string, stage: string) => void;
  onCustomerLink: (dealId: string, customerId: string) => void;
  onExpectedCloseChange: (dealId: string, value: string | null) => void;
  onNotesUpdate: (dealId: string, notes: string) => void;
  onMarkWon: (dealId: string) => void;
  onMarkLost: (dealId: string) => void;
}) {
  const [meetingSummaryOpen, setMeetingSummaryOpen] = useState(false);
  const notesPlaceholder = locale === 'da'
    ? 'Tilføj næste skridt, indvendinger og kontekst...'
    : locale === 'de'
      ? 'Nächste Schritte, Einwände und Kontext hinzufügen...'
      : 'Add next steps, objections, and context...';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {deal && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2"><Briefcase className="h-5 w-5" />{deal.title}</SheetTitle>
              </SheetHeader>
              <div className="space-y-6 mt-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('pages.deals.value')}</Label>
                    <p className="text-lg font-bold">{formatCurrency(deal.value)}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('pages.deals.stage')}</Label>
                    <div className="mt-1">
                      <Select value={deal.stage} onValueChange={v => onStageChange(deal.id, v)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>{stages.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">{t('pages.deals.customer')}</Label>
                  {deal.customers?.name ? (
                    <p className="font-medium">{deal.customers.name}</p>
                  ) : (
                    <div className="mt-1">
                      <Select
                        value=""
                        onValueChange={v => {
                          if (!v) return;
                          onCustomerLink(deal.id, v);
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
                    value={deal.expected_close_date || ''}
                    onChange={e => onExpectedCloseChange(deal.id, e.target.value || null)}
                  />
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">{t('pages.deals.created')}</Label>
                  <p>{new Date(deal.created_at).toLocaleDateString()}</p>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t('pages.deals.notesLabel')}</Label>
                  <Textarea
                    defaultValue={deal.notes || ''}
                    placeholder={notesPlaceholder}
                    rows={4}
                    onBlur={e => {
                      if (e.target.value !== (deal.notes || '')) onNotesUpdate(deal.id, e.target.value);
                    }}
                  />
                </div>

                <DealCoachPanel dealId={deal.id} dealTitle={deal.title} />

                <Button variant="outline" className="w-full gap-2" onClick={() => setMeetingSummaryOpen(true)}>
                  <Mic className="h-4 w-4" /> {locale === 'da' ? 'AI Mødeopsummering' : 'AI Meeting Summary'}
                </Button>

                <div className="flex gap-2">
                  {deal.stage !== 'won' && (
                    <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onMarkWon(deal.id)} disabled={!canMarkDealWon(deal)}>
                      <Trophy className="h-4 w-4 mr-2" />{t('pages.deals.markWon')}
                    </Button>
                  )}
                  {deal.stage !== 'lost' && (
                    <Button variant="destructive" className="flex-1" onClick={() => onMarkLost(deal.id)}>
                      <XCircle className="h-4 w-4 mr-2" />{t('pages.deals.markLost')}
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <MeetingSummaryDialog
        open={meetingSummaryOpen}
        onOpenChange={setMeetingSummaryOpen}
        dealId={deal?.id}
      />
    </>
  );
}
