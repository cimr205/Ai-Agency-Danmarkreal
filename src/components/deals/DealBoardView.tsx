import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Briefcase, Calendar } from 'lucide-react';
import type { DealWithCustomer } from '@/hooks/api/useDeals';
import type { StageDef } from '@/lib/deals/stages';
import { normalizeStageKey } from '@/lib/deals/stages';

export function DealBoardView({
  deals, stages, locale, formatCurrency, onSelectDeal, onDrop,
}: {
  deals: DealWithCustomer[];
  stages: StageDef[];
  locale: string;
  formatCurrency: (n: number) => string;
  onSelectDeal: (deal: DealWithCustomer) => void;
  onDrop: (dealId: string, newStage: string) => void;
}) {
  const kanbanGroups = useMemo(() => {
    const groups: Record<string, DealWithCustomer[]> = {};
    stages.forEach(s => { groups[s.key] = []; });
    deals.forEach(deal => {
      const key = normalizeStageKey(deal.stage) || 'discovery';
      if (groups[key]) {
        groups[key].push(deal);
      } else {
        const first = stages[0]?.key;
        if (first && groups[first]) groups[first].push(deal);
      }
    });
    return groups;
  }, [deals, stages]);

  return (
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
            if (dealId) onDrop(dealId, stage.key);
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
                onClick={() => onSelectDeal(deal)}
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
  );
}
