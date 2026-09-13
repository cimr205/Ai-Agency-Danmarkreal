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

export interface CampaignAttribution {
  campaignId: string;
  leads: number;
  qualified: number;
  deals: number;
  won: number;
  revenue: number;
}

// Real campaign -> leads -> qualified -> deals -> won -> revenue chain, built
// from data that already exists (customers.campaign_id, which
// convert_lead_to_deal already copies from lead to the resulting customer
// row — see 20260901000001_atomic_lead_conversion.sql). No new backend
// columns; this is a client-side join the same way useDashboard.ts already
// aggregates client-side. Counts leads once (record_type='lead' rows only)
// to avoid double-counting the post-conversion customer row that shares the
// same campaign_id.
export function useCampaignAttribution() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['campaign-attribution', profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async (): Promise<Record<string, CampaignAttribution>> => {
      const companyId = profile!.company_id!;
      const { data: customers, error: custErr } = await supabase
        .from('customers')
        .select('id, campaign_id, record_type, status')
        .eq('company_id', companyId)
        .not('campaign_id', 'is', null);
      if (custErr) throw custErr;

      const customerCampaignMap = new Map<string, string>();
      const customerIds: string[] = [];
      (customers ?? []).forEach((c) => {
        if (c.record_type === 'customer' && c.campaign_id) {
          customerCampaignMap.set(c.id, c.campaign_id);
          customerIds.push(c.id);
        }
      });

      const { data: deals, error: dealsErr } = customerIds.length > 0
        ? await supabase.from('deals').select('customer_id, stage, value').in('customer_id', customerIds)
        : { data: [] as { customer_id: string | null; stage: string; value: number }[], error: null };
      if (dealsErr) throw dealsErr;

      const result: Record<string, CampaignAttribution> = {};
      const ensure = (id: string) => (result[id] ??= { campaignId: id, leads: 0, qualified: 0, deals: 0, won: 0, revenue: 0 });

      (customers ?? []).forEach((c) => {
        if (!c.campaign_id || c.record_type !== 'lead') return;
        const bucket = ensure(c.campaign_id);
        bucket.leads++;
        if (c.status === 'qualified' || c.status === 'customer') bucket.qualified++;
      });

      (deals ?? []).forEach((d) => {
        if (!d.customer_id) return;
        const campaignId = customerCampaignMap.get(d.customer_id);
        if (!campaignId) return;
        const bucket = ensure(campaignId);
        bucket.deals++;
        if (d.stage === 'won') {
          bucket.won++;
          bucket.revenue += Number(d.value || 0);
        }
      });

      return result;
    },
    staleTime: 60_000,
  });
}
