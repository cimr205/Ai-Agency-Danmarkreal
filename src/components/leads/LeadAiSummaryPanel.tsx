import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, Clock, AlertCircle, RefreshCw, Sparkles, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { useLeadAiRecommendation, type LeadAiSummary } from '@/hooks/api/usePipeline';

interface LeadAiSummaryPanelProps {
  leadId: string;
}

export function LeadAiSummaryPanel({ leadId }: LeadAiSummaryPanelProps) {
  const { t } = useI18n();
  const aiRecommend = useLeadAiRecommendation();
  const [summary, setSummary] = useState<LeadAiSummary | null>(null);

  const analyze = async () => {
    try {
      const res = await aiRecommend.mutateAsync(leadId);
      setSummary(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common.error'));
    }
  };

  const riskColors = {
    low: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    medium: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
    high: 'bg-destructive/15 text-destructive border-destructive/30',
  };
  const riskLabels = {
    low: t('dealCoach.riskLow') || 'Low risk',
    medium: t('dealCoach.riskMedium') || 'Medium risk',
    high: t('dealCoach.riskHigh') || 'High risk',
  };

  if (!summary && !aiRecommend.isPending) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="flex flex-col items-center justify-center py-6 text-center">
          <div className="relative mb-3">
            <Brain className="h-8 w-8 text-primary" />
            <Sparkles className="h-3.5 w-3.5 text-primary absolute -top-1 -right-1 animate-pulse" />
          </div>
          <h3 className="font-semibold text-sm mb-1">AI Relationship Summary</h3>
          <p className="text-xs text-muted-foreground mb-3 max-w-[220px]">
            Get the history, open promises, and stall risk without scrolling through notes.
          </p>
          <Button size="sm" onClick={analyze} className="gap-2">
            <Brain className="h-3.5 w-3.5" />
            Summarize relationship
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (aiRecommend.isPending) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary animate-pulse" />
            Analyzing history…
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            AI Relationship Summary
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={analyze} className="h-7 w-7 p-0">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-foreground/90 flex-1">{summary.summary}</p>
          <Badge variant="outline" className={`shrink-0 ${riskColors[summary.risk_level]}`}>
            {riskLabels[summary.risk_level]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{summary.risk_reason}</p>

        <div className="flex items-start gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-foreground/90">{summary.last_contact_summary}</p>
            <p className="text-xs text-muted-foreground">{summary.days_since_contact} days since last activity</p>
          </div>
        </div>

        {summary.open_promises.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Open promises
            </h4>
            <div className="space-y-2">
              {summary.open_promises.map((p, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 text-sm bg-primary/5 rounded-lg p-3">
          <ArrowRight className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <span className="font-medium">{summary.next_action}</span>
        </div>
      </CardContent>
    </Card>
  );
}
