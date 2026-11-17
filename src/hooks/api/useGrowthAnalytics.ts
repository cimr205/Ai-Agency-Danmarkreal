import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { GrowthNotInstalledError } from '@/hooks/api/useGrowthOs';

// GA4 / Search Console snapshots synced server-side by the Growth OS service.
// RLS scopes every read to the caller's company; writes go through growth_* RPCs.
const db = supabase as unknown as SupabaseClient;

export interface AnalyticsConnection {
  company_id: string; ga4_property_id: string | null; gsc_site_url: string | null;
  status: 'pending' | 'active' | 'no_access' | 'error' | 'disabled';
  requested_at: string; approved_at: string | null; last_sync_at: string | null; last_error: string | null;
  ga4_synced_through: string | null; gsc_synced_through: string | null;
}
export interface Ga4DailyRow { day: string; channel_group: string; sessions: number; active_users: number; engaged_sessions: number; key_events: number }
export interface Ga4LandingRow { day: string; landing_page: string; channel_group: string; sessions: number; engaged_sessions: number; key_events: number }
export interface GscDailyRow { day: string; clicks: number; impressions: number; ctr: number; position: number }
export interface GscQueryPageRow { day: string; query: string; page: string; clicks: number; impressions: number; position: number }
export interface SeoRecommendation {
  id: string; kind: 'ctr_gap' | 'traffic_drop' | 'no_key_events' | 'striking_distance'; target: string; problem: string;
  evidence: Record<string, unknown>; action: string; priority: 1 | 2 | 3; expected_effect: string;
  status: 'proposed' | 'approved' | 'rejected' | 'implemented' | 'measured';
  decided_at: string | null; implemented_on: string | null; outcome: Record<string, unknown> | null; created_at: string;
}
export interface BusinessImpact {
  leads_total: number; leads_without_source: number; leads_organic: number; leads_organic_converted: number;
  paying_customers_total: number; paying_customers_organic: number; revenue_organic: number;
}

function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === '42P01' || error.code === 'PGRST202' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) throw new GrowthNotInstalledError(error.message);
  throw new Error(error.message);
}

/** Paged read of one company-scoped snapshot table for a day range (PostgREST caps each response). */
async function readRange<T>(table: string, cols: string, from: string, to: string): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const { data, error } = await db.from(table).select(cols).gte('day', from).lte('day', to).order('day').range(offset, offset + 999);
    check(error);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

const STALE = 60_000;

export function useAnalyticsConnections() {
  return useQuery({
    queryKey: ['growth-os', 'analytics', 'connections'],
    queryFn: async () => {
      const { data, error } = await db.from('growth_analytics_connections').select('*').order('requested_at', { ascending: false });
      check(error);
      return (data ?? []) as AnalyticsConnection[];
    },
    staleTime: STALE, retry: false,
  });
}

export function useGa4Daily(from: string, to: string, enabled = true) {
  return useQuery({ queryKey: ['growth-os', 'analytics', 'ga4-daily', from, to], enabled, staleTime: STALE, retry: false,
    queryFn: () => readRange<Ga4DailyRow>('growth_ga4_daily', 'day, channel_group, sessions, active_users, engaged_sessions, key_events', from, to) });
}
export function useGa4Landing(from: string, to: string, enabled = true) {
  return useQuery({ queryKey: ['growth-os', 'analytics', 'ga4-landing', from, to], enabled, staleTime: STALE, retry: false,
    queryFn: () => readRange<Ga4LandingRow>('growth_ga4_landing_daily', 'day, landing_page, channel_group, sessions, engaged_sessions, key_events', from, to) });
}
export function useGscDaily(from: string, to: string, enabled = true) {
  return useQuery({ queryKey: ['growth-os', 'analytics', 'gsc-daily', from, to], enabled, staleTime: STALE, retry: false,
    queryFn: () => readRange<GscDailyRow>('growth_gsc_daily', 'day, clicks, impressions, ctr, position', from, to) });
}
export function useGscQueryPage(from: string, to: string, enabled = true) {
  return useQuery({ queryKey: ['growth-os', 'analytics', 'gsc-qp', from, to], enabled, staleTime: STALE, retry: false,
    queryFn: () => readRange<GscQueryPageRow>('growth_gsc_query_page_daily', 'day, query, page, clicks, impressions, position', from, to) });
}

export function useSeoRecommendations() {
  return useQuery({
    queryKey: ['growth-os', 'analytics', 'recommendations'], staleTime: STALE, retry: false,
    queryFn: async () => {
      const { data, error } = await db.from('growth_seo_recommendations')
        .select('id, kind, target, problem, evidence, action, priority, expected_effect, status, decided_at, implemented_on, outcome, created_at')
        .order('priority').order('created_at', { ascending: false }).limit(200);
      check(error);
      return (data ?? []) as SeoRecommendation[];
    },
  });
}

export function useBusinessImpact(from: string, to: string) {
  return useQuery({
    queryKey: ['growth-os', 'analytics', 'impact', from, to], staleTime: STALE, retry: false,
    queryFn: async () => {
      const { data, error } = await db.rpc('growth_business_impact', { _from: from, _to: to });
      check(error);
      return data as BusinessImpact | null;
    },
  });
}

function useGrowthMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ['growth-os'] }) });
}

export function useRequestAnalyticsConnection() {
  return useGrowthMutation(async (v: { ga4PropertyId: string; gscSiteUrl: string }) => {
    const { error } = await db.rpc('growth_request_analytics_connection', { _ga4_property_id: v.ga4PropertyId, _gsc_site_url: v.gscSiteUrl });
    check(error);
  });
}
export function useSetConnectionStatus() {
  return useGrowthMutation(async (v: { companyId: string; status: 'active' | 'disabled' }) => {
    const { error } = await db.rpc('growth_set_analytics_connection_status', { _company_id: v.companyId, _status: v.status });
    check(error);
  });
}
export function useDecideRecommendation() {
  return useGrowthMutation(async (v: { id: string; approve: boolean }) => {
    const { error } = await db.rpc('growth_decide_recommendation', { _id: v.id, _approve: v.approve, _reason: null });
    check(error);
  });
}
export function useMarkImplemented() {
  return useGrowthMutation(async (v: { id: string; on: string }) => {
    const { error } = await db.rpc('growth_mark_recommendation_implemented', { _id: v.id, _implemented_on: v.on });
    check(error);
  });
}
/** Queues the SEO agent's opportunity analysis; the Growth OS service runs it. */
export function useRunOpportunities() {
  return useGrowthMutation(async (objective: string) => {
    const { error } = await db.rpc('growth_enqueue_task', {
      _agent_id: 'seo-agent', _type: 'seo.opportunities', _input: {}, _objective: objective,
      _idempotency_key: `seo-opps:${new Date().toISOString().slice(0, 13)}`, // at most one run per hour
    });
    check(error);
  });
}
