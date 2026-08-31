import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, TrendingUp, AlertTriangle, CheckCircle, RefreshCw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { getErrorMessage, getFunctionErrorMessage } from '@/lib/errors';

interface DealCoachAnalysis {
  win_probability: number;
  risk_level: 'low' | 'medium' | 'high';
  summary: string;
  actions: string[];
  insights: string[];
}

interface DealCoachPanelProps {
  dealId: string;
  dealTitle: string;
}

export function DealCoachPanel({ dealId, dealTitle }: DealCoachPanelProps) {
  const { t } = useI18n();
  const [analysis, setAnalysis] = useState<DealCoachAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('deal-coach', {
        body: { deal_id: dealId },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      if (data?.error) throw new Error(data.error);
      setAnalysis(data);
    } catch (e) {
      toast.error((getErrorMessage(e) || t('dealCoach.analyzeError')));
    } finally {
      setLoading(false);
    }
  };

  const riskColors = {
    low: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    medium: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
    high: 'bg-destructive/15 text-destructive border-destructive/30',
  };

  const riskLabels = { low: t('dealCoach.riskLow'), medium: t('dealCoach.riskMedium'), high: t('dealCoach.riskHigh') };

  const probColor = (p: number) =>
    p >= 70 ? 'text-emerald-500' : p >= 40 ? 'text-yellow-500' : 'text-destructive';

  if (!analysis && !loading) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <div className="relative mb-4">
            <Brain className="h-10 w-10 text-primary" />
            <Sparkles className="h-4 w-4 text-primary absolute -top-1 -right-1 animate-pulse" />
          </div>
          <h3 className="font-semibold text-sm mb-1">AI Deal Coach</h3>
          <p className="text-xs text-muted-foreground mb-4 max-w-[200px]">
            {t('dealCoach.description')}
          </p>
          <Button size="sm" onClick={analyze} className="gap-2">
            <Brain className="h-3.5 w-3.5" />
            {t('dealCoach.analyze')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary animate-pulse" />
            {t('dealCoach.analyzing')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!analysis) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            AI Deal Coach
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={analyze} className="h-7 w-7 p-0">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">{t('dealCoach.winProbability')}</span>
              <span className={`text-lg font-bold ${probColor(analysis.win_probability)}`}>
                {analysis.win_probability}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  analysis.win_probability >= 70 ? 'bg-emerald-500' : analysis.win_probability >= 40 ? 'bg-yellow-500' : 'bg-destructive'
                }`}
                style={{ width: `${analysis.win_probability}%` }}
              />
            </div>
          </div>
          <Badge variant="outline" className={riskColors[analysis.risk_level]}>
            {riskLabels[analysis.risk_level]}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground">{analysis.summary}</p>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {t('dealCoach.recommendedActions')}
          </h4>
          <div className="space-y-2">
            {analysis.actions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>{action}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {t('dealCoach.insights')}
          </h4>
          <div className="space-y-2">
            {analysis.insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <TrendingUp className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span>{insight}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
