import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { GrowthNotInstalledError } from '@/hooks/api/useGrowthOs';

// SEO autopilot data, written server-side by the Growth OS service. RLS scopes every
// read to the caller's company; humans change things only through growth_seo_* RPCs.
const db = supabase as unknown as SupabaseClient;
const STALE = 60_000;

export interface SeoSite {
  company_id: string; site_url: string; enabled: boolean; crawl_every_hours: number; max_pages: number;
  max_pending_drafts: number; llm_calls_per_day: number; product_facts: string; last_run_at: string | null; updated_at: string;
  auto_publish: boolean; auto_publish_since: string | null; publish_min_score: number; max_publish_per_day: number; last_deploy_requested_at: string | null;
}
export interface SeoRun {
  id: string; kind: 'loop' | 'ga4' | 'rea'; trigger: 'schedule' | 'manual' | 'import'; status: 'running' | 'ok' | 'error';
  score: number | null; pages: number | null; findings: number | null; changes: number | null; llm_calls: number;
  models: string[]; cost_usd: number; summary: string | null; error: string | null; log: string[]; started_at: string; finished_at: string | null;
}
export interface SeoFinding { id: number; url: string; severity: 'high' | 'medium' | 'low'; issue: string; fix: string }
export interface SeoChange { id: number; url: string; field: string; before: string | null; after: string | null }
export interface SeoTask { id: string; type: 'technical_audit' | 'page_draft'; title: string; target: string | null; rationale: string | null; priority: number; status: 'open' | 'done' | 'failed'; attempts: number; error: string | null; created_at: string }
export interface SeoDraft {
  id: string; kind: 'page' | 'audit'; slug: string | null; title: string; meta_description: string | null; h1: string | null; summary: string | null; body: string;
  worker_model: string | null; review_model: string | null; review_score: number | null; review_notes: string | null;
  review_status: 'pending' | 'passed' | 'failed'; decision: 'pending' | 'approved' | 'rejected'; decided_at: string | null; created_at: string;
  published_at: string | null; published_by: 'autopilot' | 'user' | null; unpublished_at: string | null; publish_block_reason: string | null;
}
export interface SeoReport { id: string; kind: 'rea' | 'ga4'; target: string | null; title: string; body: string; created_at: string }

function check(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (error.code === '42P01' || error.code === 'PGRST202' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) throw new GrowthNotInstalledError(error.message);
  throw new Error(error.message);
}

const key = (...k: unknown[]) => ['growth-os', 'seo-autopilot', ...k];

export function useSeoSite() {
  return useQuery({ queryKey: key('site'), staleTime: STALE, retry: false, queryFn: async () => {
    const { data, error } = await db.from('growth_seo_sites').select('*').maybeSingle();
    check(error);
    return (data ?? null) as SeoSite | null;
  } });
}

export function useSeoRuns(limit = 60) {
  return useQuery({ queryKey: key('runs', limit), staleTime: STALE, retry: false, refetchInterval: 60_000, queryFn: async () => {
    const { data, error } = await db.from('growth_seo_runs')
      .select('id, kind, trigger, status, score, pages, findings, changes, llm_calls, models, cost_usd, summary, error, log, started_at, finished_at')
      .eq('kind', 'loop').order('started_at', { ascending: false }).limit(limit);
    check(error);
    return (data ?? []) as SeoRun[];
  } });
}

export function useSeoFindings(runId: string | undefined) {
  return useQuery({ queryKey: key('findings', runId), enabled: !!runId, staleTime: STALE, retry: false, queryFn: async () => {
    const { data, error } = await db.from('growth_seo_findings').select('id, url, severity, issue, fix').eq('run_id', runId!).order('id').limit(1000);
    check(error);
    return (data ?? []) as SeoFinding[];
  } });
}

/** Field changes from the most recent runs that had any. */
export function useSeoChanges(runIds: string[]) {
  return useQuery({ queryKey: key('changes', runIds), enabled: runIds.length > 0, staleTime: STALE, retry: false, queryFn: async () => {
    const { data, error } = await db.from('growth_seo_changes').select('id, run_id, url, field, before, after').in('run_id', runIds).order('id', { ascending: false }).limit(200);
    check(error);
    return (data ?? []) as (SeoChange & { run_id: string })[];
  } });
}

export function useSeoTasks() {
  return useQuery({ queryKey: key('tasks'), staleTime: STALE, retry: false, queryFn: async () => {
    const { data, error } = await db.from('growth_seo_tasks').select('id, type, title, target, rationale, priority, status, attempts, error, created_at').order('created_at', { ascending: false }).limit(100);
    check(error);
    return (data ?? []) as SeoTask[];
  } });
}

export function useSeoDrafts() {
  return useQuery({ queryKey: key('drafts'), staleTime: STALE, retry: false, queryFn: async () => {
    const { data, error } = await db.from('growth_seo_drafts')
      .select('id, kind, slug, title, meta_description, h1, summary, body, worker_model, review_model, review_score, review_notes, review_status, decision, decided_at, created_at, published_at, published_by, unpublished_at, publish_block_reason')
      .order('created_at', { ascending: false }).limit(100);
    check(error);
    return (data ?? []) as SeoDraft[];
  } });
}

export function useSeoReports() {
  return useQuery({ queryKey: key('reports'), staleTime: STALE, retry: false, queryFn: async () => {
    const { data, error } = await db.from('growth_seo_reports').select('id, kind, target, title, body, created_at').order('created_at', { ascending: false }).limit(50);
    check(error);
    return (data ?? []) as SeoReport[];
  } });
}

function useSeoMutation<V>(fn: (v: V) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ['growth-os'] }) });
}

export function useConfigureSeoSite() {
  return useSeoMutation(async (v: { siteUrl: string; enabled: boolean; crawlEveryHours: number; llmCallsPerDay: number; productFacts: string }) => {
    const { error } = await db.rpc('growth_seo_configure_site', {
      _site_url: v.siteUrl, _enabled: v.enabled, _crawl_every_hours: v.crawlEveryHours, _llm_calls_per_day: v.llmCallsPerDay, _product_facts: v.productFacts,
    });
    check(error);
  });
}

export function useDecideSeoDraft() {
  return useSeoMutation(async (v: { id: string; approve: boolean }) => {
    const { error } = await db.rpc('growth_seo_decide_draft', { _id: v.id, _approve: v.approve, _note: null });
    check(error);
  });
}

/** Owner switch: the autopilot publishes its own articles (score threshold, content checks, daily cap). */
export function useSetSeoAutoPublish() {
  return useSeoMutation(async (v: { enabled: boolean; minScore: number; maxPerDay: number }) => {
    const { error } = await db.rpc('growth_seo_set_auto_publish', { _enabled: v.enabled, _min_score: v.minScore, _max_per_day: v.maxPerDay });
    check(error);
  });
}

/** Takes a live article off the website (the next site build removes its static page). */
export function useUnpublishSeoDraft() {
  return useSeoMutation(async (id: string) => {
    const { error } = await db.rpc('growth_seo_unpublish', { _id: id, _note: null });
    check(error);
  });
}

/** Queues one autopilot round now; the Growth OS service runs it (at most one per hour from this button). */
export function useRunSeoAutopilot() {
  return useSeoMutation(async (objective: string) => {
    const { error } = await db.rpc('growth_enqueue_task', {
      _agent_id: 'seo-agent', _type: 'seo.autopilot', _input: {}, _objective: objective,
      _idempotency_key: `seo-autopilot:${new Date().toISOString().slice(0, 13)}`,
    });
    check(error);
  });
}
