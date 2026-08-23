import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { Briefcase, Trophy, XCircle, Plus } from 'lucide-react';
import type { DealWithCustomer } from '@/hooks/api/useDeals';
import { stageColors } from '@/lib/deals/stages';

export function DealListView({
  deals, isLoading, error, t, formatCurrency, getStageLabel, onSelectDeal, onMarkWon, onMarkLost, onCreate,
}: {
  deals: DealWithCustomer[];
  isLoading: boolean;
  error: unknown;
  t: (key: string) => string;
  formatCurrency: (n: number) => string;
  getStageLabel: (stage: string) => string;
  onSelectDeal: (deal: DealWithCustomer) => void;
  onMarkWon: (dealId: string) => void;
  onMarkLost: (dealId: string) => void;
  onCreate: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
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
              )) : deals.length === 0 ? (
                <TableRow><TableCell colSpan={7}>
                  <EmptyState
                    bare
                    icon={Briefcase}
                    title={error ? t('pages.deals.fetchError') : t('pages.deals.empty')}
                    action={!error ? { label: t('pages.deals.newDeal'), onClick: onCreate, icon: Plus } : undefined}
                  />
                </TableCell></TableRow>
              ) : deals.map(deal => (
                <TableRow key={deal.id} className="cursor-pointer hover:bg-muted/50" onClick={() => onSelectDeal(deal)}>
                  <TableCell className="font-medium"><div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-muted-foreground" />{deal.title}</div></TableCell>
                  <TableCell className="text-muted-foreground">{deal.customers?.name || '—'}</TableCell>
                  <TableCell><span className="font-medium">{formatCurrency(deal.value)}</span></TableCell>
                  <TableCell><Badge variant="outline" className={stageColors[deal.stage] || ''}>{getStageLabel(deal.stage)}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{deal.expected_close_date ? new Date(deal.expected_close_date).toLocaleDateString() : '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{deal.created_at ? new Date(deal.created_at).toLocaleDateString() : '—'}</TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {deal.stage !== 'won' && <Button variant="ghost" size="sm" className="text-emerald-600" onClick={() => onMarkWon(deal.id)}><Trophy className="h-3.5 w-3.5" /></Button>}
                      {deal.stage !== 'lost' && <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onMarkLost(deal.id)}><XCircle className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
