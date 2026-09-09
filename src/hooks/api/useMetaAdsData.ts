import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Reads the tables `supabase/functions/meta-sync/index.ts` already populates
// (meta_campaigns, meta_daily_insights) — the sync pipeline is real, only the
// UI never read from it. Aggregation (spend/ctr/cpc/conversions over the
// trailing 30 days, week-over-week trend) happens client-side, same pattern
// as useDashboard.ts, since this is a read-only summary with no atomicity
// requirement.

export interface MetaCampaignSummary {
  id: string;
  metaCampaignId: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
  objective: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  conversions: number;
  trend: 'up' | 'down' | 'flat';
}

const WINDOW_DAYS = 30;

export function useMetaCampaigns() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['meta-campaigns', profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async (): Promise<MetaCampaignSummary[]> => {
      const companyId = profile!.company_id!;

      const { data: campaigns, error: campaignsError } = await supabase
        .from('meta_campaigns')
        .select('id, meta_campaign_id, name, status, effective_status, objective')
        .eq('company_id', companyId)
        .order('name', { ascending: true });
      if (campaignsError) throw campaignsError;
      if (!campaigns?.length) return [];

      const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const midpoint = new Date(Date.now() - (WINDOW_DAYS / 2) * 24 * 3600 * 1000).toISOString().slice(0, 10);

      const { data: insights, error: insightsError } = await supabase
        .from('meta_daily_insights')
        .select('external_object_id, insight_date, spend, impressions, clicks, conversions')
        .eq('company_id', companyId)
        .eq('level', 'campaign')
        .gte('insight_date', since);
      if (insightsError) throw insightsError;

      return campaigns.map((c) => {
        const rows = (insights ?? []).filter((i) => i.external_object_id === c.meta_campaign_id);
        const recent = rows.filter((r) => r.insight_date >= midpoint);
        const earlier = rows.filter((r) => r.insight_date < midpoint);
        const sum = (list: typeof rows, key: 'spend' | 'impressions' | 'clicks' | 'conversions') =>
          list.reduce((s, r) => s + Number(r[key] ?? 0), 0);

        const spend = sum(rows, 'spend');
        const impressions = sum(rows, 'impressions');
        const clicks = sum(rows, 'clicks');
        const conversions = sum(rows, 'conversions');
        const recentSpend = sum(recent, 'spend');
        const earlierSpend = sum(earlier, 'spend');

        return {
          id: c.id,
          metaCampaignId: c.meta_campaign_id,
          name: c.name,
          status: c.status,
          effectiveStatus: c.effective_status,
          objective: c.objective,
          spend,
          impressions,
          clicks,
          ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
          cpc: clicks > 0 ? spend / clicks : 0,
          conversions,
          trend: recentSpend > earlierSpend * 1.05 ? 'up' : recentSpend < earlierSpend * 0.95 ? 'down' : 'flat',
        };
      });
    },
    staleTime: 60_000,
  });
}
