import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

// The growth_* tables are newer than the generated Database types, so this
// module uses an untyped view of the same client. RLS still scopes every read
// to the caller's company; writes only go through the growth_* RPCs.
const db = supabase as unknown as SupabaseClient;

export interface GrowthTaskRow {
  id: string; agent_id: string; type: string; status: string; objective: string | null;
  input: { url?: string }; priority: number; attempts: number; budget_usd: number;
  created_at: string; updated_at: string; last_error: string | null;
}
export interface GrowthEventRow {
  id: number; task_id: string | null; agent_id: string; phase: string; action: string;
  status: string; detail: Record<string, unknown>; cost_usd: number | null; created_at: string;
}
export interface GrowthUsageRow {
  id: number; task_id: string | null; agent_id: string; model: string; purpose: string; request_id: string;
  prompt_tokens: number | null; completion_tokens: number | null; estimated_usd: number; actual_usd: number | null;
  latency_ms: number; status: string; created_at: string;
}
export interface GrowthReportRow { id: string; task_id: string; agent_id: string; kind: 'agent' | 'verification' | 'ceo'; body: Record<string, unknown>; created_at: string }
export interface GrowthLearningRow { id: string; task_id: string | null; agent_id: string; skill_version: string; model: string | null; outcome: string; observation: string; proposed_change: string | null; evaluation_status: string; created_at: string }
export interface GrowthApprovalRow { id: string; agent_id: string; action: string; level: number; summary: string; payload: unknown; payload_hash: string; status: string; requested_at: string; expires_at: string; decided_at: string | null; decision_reason: string | null }
export interface GrowthAuditRow { id: number; actor_type: string; actor_id: string; event: string; subject_id: string | null; detail: Record<string, unknown>; created_at: string }
export interface GrowthBudget { daily_usd_limit: number; task_usd_limit: number }

/** A missing table (migration not applied yet) is reported as such, never as "no data". */
export class GrowthNotInstalledError extends Error {}

async function rows<T>(q: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message)) throw new GrowthNotInstalledError(error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as T[];
}

const LIVE = 15_000;

export function useGrowthTasks(agentId?: string) {
  return useQuery({
    queryKey: ['growth-os', 'tasks', agentId ?? 'all'],
    queryFn: () => {
      let q = db.from('growth_tasks').select('id, agent_id, type, status, objective, input, priority, attempts, budget_usd, created_at, updated_at, last_error').order('created_at', { ascending: false }).limit(100);
      if (agentId) q = q.eq('agent_id', agentId);
      return rows<GrowthTaskRow>(q);
    },
    refetchInterval: LIVE,
    retry: false,
  });
}

export function useGrowthActivity(limit = 100, agentId?: string) {
  return useQuery({
    queryKey: ['growth-os', 'activity', limit, agentId ?? 'all'],
    queryFn: () => {
      let q = db.from('growth_activity_events').select('*').order('created_at', { ascending: false }).limit(limit);
      if (agentId) q = q.eq('agent_id', agentId);
      return rows<GrowthEventRow>(q);
    },
    refetchInterval: LIVE,
    retry: false,
  });
}

export function useGrowthUsage(days = 30) {
  return useQuery({
    queryKey: ['growth-os', 'usage', days],
    queryFn: () => rows<GrowthUsageRow>(db.from('growth_model_usage').select('*').gte('created_at', new Date(Date.now() - days * 86_400_000).toISOString()).order('created_at', { ascending: false }).limit(1000)),
    refetchInterval: LIVE,
    retry: false,
  });
}

export function useGrowthReports(agentId?: string) {
  return useQuery({
    queryKey: ['growth-os', 'reports', agentId ?? 'all'],
    queryFn: () => {
      let q = db.from('growth_reports').select('*').order('created_at', { ascending: false }).limit(100);
      if (agentId) q = q.or(`agent_id.eq.${agentId},agent_id.eq.${agentId}-verifier`);
      return rows<GrowthReportRow>(q);
    },
    refetchInterval: LIVE,
    retry: false,
  });
}

export function useGrowthLearning() {
  return useQuery({
    queryKey: ['growth-os', 'learning'],
    queryFn: () => rows<GrowthLearningRow>(db.from('growth_learning_records').select('*').order('created_at', { ascending: false }).limit(100)),
    retry: false,
  });
}

export function useGrowthApprovals() {
  return useQuery({
    queryKey: ['growth-os', 'approvals'],
    queryFn: () => rows<GrowthApprovalRow>(db.from('growth_approval_requests').select('*').order('requested_at', { ascending: false }).limit(100)),
    refetchInterval: LIVE,
    retry: false,
  });
}

export function useGrowthAudit() {
  return useQuery({
    queryKey: ['growth-os', 'audit'],
    queryFn: () => rows<GrowthAuditRow>(db.from('growth_audit_log').select('*').order('created_at', { ascending: false }).limit(200)),
    retry: false,
  });
}

export function useGrowthBudget() {
  return useQuery({
    queryKey: ['growth-os', 'budget'],
    queryFn: async () => {
      const [b, d] = await Promise.all([
        rows<GrowthBudget>(db.from('growth_budgets').select('daily_usd_limit, task_usd_limit').limit(1)),
        rows<{ spent_usd: number }>(db.from('growth_budget_days').select('spent_usd').eq('day', new Date().toISOString().slice(0, 10)).limit(1)),
      ]);
      // No row yet: the server-side defaults in growth_reserve_budget apply.
      return { budget: b[0] ?? { daily_usd_limit: 0.5, task_usd_limit: 0.05 }, isDefault: !b[0], spentToday: Number(d[0]?.spent_usd ?? 0) };
    },
    refetchInterval: LIVE,
    retry: false,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  return qc.invalidateQueries({ queryKey: ['growth-os'] });
}

export interface GrowthRunResult {
  task_id: string; status: string; error?: string | null;
  report?: { after_metrics?: { onpage_score?: number }; recommendation?: string };
  verification?: { status: string };
}

const TERMINAL = ['completed', 'failed', 'inconclusive', 'blocked', 'cancelled', 'dead'];

/**
 * Enqueues through growth_enqueue_task (as the signed-in user: company, role, executor,
 * budget and idempotency are checked in SQL). The Growth OS service on Railway picks it
 * up from the queue; this waits for the result, and says so if the worker is not running.
 */
export function useRunSeoAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { url: string; objective: string }): Promise<GrowthRunResult> => {
      const { data: taskId, error } = await db.rpc('growth_enqueue_task', {
        _agent_id: 'seo-agent', _type: 'seo.onpage_audit', _input: { url: input.url },
        _objective: input.objective, _idempotency_key: `seo:${input.url}:${crypto.randomUUID()}`,
      });
      if (error) {
        if (error.code === 'PGRST202' || /does not exist|schema cache/i.test(error.message)) throw new GrowthNotInstalledError(error.message);
        throw new Error(error.message);
      }
      void invalidate(qc);
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 3_000));
        const { data: t, error: e } = await db.from('growth_tasks').select('status, result, last_error').eq('id', taskId).maybeSingle();
        if (e) throw new Error(e.message);
        if (t && TERMINAL.includes(t.status)) {
          const r = (t.result ?? {}) as Pick<GrowthRunResult, 'report' | 'verification'>;
          return { task_id: taskId as string, status: t.status, error: t.last_error, report: r.report, verification: r.verification };
        }
      }
      return { task_id: taskId as string, status: 'queued', error: 'worker_timeout' };
    },
    onSettled: () => invalidate(qc),
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; approve: boolean; reason?: string }) => {
      const { error } = await db.rpc('growth_decide_approval', { _request_id: v.id, _approve: v.approve, _reason: v.reason ?? null });
      if (error) throw new Error(error.message);
    },
    onSettled: () => invalidate(qc),
  });
}

export function useSetGrowthBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { daily: number; task: number }) => {
      const { error } = await db.rpc('growth_set_budget', { _daily_usd: v.daily, _task_usd: v.task });
      if (error) throw new Error(error.message);
    },
    onSettled: () => invalidate(qc),
  });
}
