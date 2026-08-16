import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PIPELINE_STAGES, getStageLabel, formatCurrency, convertCurrency, type PipelineLead } from '@/lib/pipeline';
import { ArrowLeftRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface Props {
  leads: PipelineLead[];
  currency: 'DKK' | 'USD';
  onToggleCurrency: () => void;
}

export default function PipelineValueBar({ leads, currency, onToggleCurrency }: Props) {
  const { locale } = useI18n();

  const stageValues = PIPELINE_STAGES.map(stage => {
    const stageLeads = leads.filter(l => l.status === stage.key);
    const totalValue = stageLeads.reduce((sum, l) => {
      const v = l.value || 0;
      const leadCurrency = (l.currency || 'DKK') as 'DKK' | 'USD';
      return sum + convertCurrency(v, leadCurrency, currency);
    }, 0);
    return { ...stage, count: stageLeads.length, totalValue };
  });

  return (
    <div className="flex flex-wrap items-stretch gap-3">
      {stageValues.map(stage => (
        <Card
          key={stage.key}
          className="flex-1 min-w-[140px] p-4 border-t-4"
          style={{ borderTopColor: stage.color }}
        >
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {getStageLabel(stage.key, locale)}
          </div>
          <div className="text-xl font-bold mt-1">
            {formatCurrency(stage.totalValue, currency)}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {stage.count} {stage.count === 1 ? 'lead' : 'leads'}
          </div>
        </Card>
      ))}
      <Button variant="outline" size="sm" className="self-center" onClick={onToggleCurrency}>
        <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />
        {currency}
      </Button>
    </div>
  );
}
