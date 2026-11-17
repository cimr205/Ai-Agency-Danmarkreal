// GrowthStore over Supabase (service role, agent runtime). Every write carries
// the task's company_id; reads are filtered by it explicitly because the
// service role bypasses RLS.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";
import type { ActivityEvent, GrowthStore, GrowthTask, LearningRecord } from "./engine.ts";
import { PROMPT_VERSION } from "./engine.ts";
import type { BudgetLedger, UsageRecord } from "./openrouter.ts";

// deno-lint-ignore no-explicit-any
type Db = SupabaseClient<any, any, any>;

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

export class SupabaseGrowthStore implements GrowthStore {
  constructor(private db: Db, private companyId: string) {}

  async activity(e: ActivityEvent) {
    await must(this.db.from("growth_activity_events").insert({
      company_id: this.companyId, task_id: e.taskId, agent_id: e.agentId, phase: e.phase,
      action: e.action, status: e.status, detail: e.detail, cost_usd: e.costUsd,
    }), "activity");
  }

  async usage(taskId: string, agentId: string, u: UsageRecord) {
    await must(this.db.from("growth_model_usage").insert({
      company_id: this.companyId, task_id: taskId, agent_id: agentId, request_id: u.requestId,
      generation_id: u.generationId, model: u.model, purpose: u.purpose, prompt_version: PROMPT_VERSION,
      prompt_tokens: u.promptTokens, completion_tokens: u.completionTokens, estimated_usd: u.estimatedUsd,
      actual_usd: u.actualUsd, latency_ms: Math.round(u.latencyMs), attempt: u.attempt, status: u.status, error: u.error ?? null,
    }), "usage");
  }

  async previousScore(companyId: string, agentId: string, url: string) {
    const rows = await must(this.db.from("growth_reports").select("body, created_at, growth_tasks!inner(input)")
      .eq("company_id", companyId).eq("agent_id", agentId).eq("kind", "agent")
      .eq("growth_tasks.input->>url", url).order("created_at", { ascending: false }).limit(1), "previousScore");
    const body = (rows as { body: { after_metrics?: { onpage_score?: number | null }; verification?: { status?: string } } }[])[0]?.body;
    // Only a verified earlier score counts as a baseline.
    return body?.verification?.status === "verified" ? body.after_metrics?.onpage_score ?? null : null;
  }

  async openDuplicateTasks(task: GrowthTask) {
    const { count, error } = await this.db.from("growth_tasks").select("id", { count: "exact", head: true })
      .eq("company_id", task.companyId).eq("agent_id", task.agentId).in("status", ["queued", "leased"])
      .neq("id", task.id).eq("input->>url", task.input.url ?? "");
    if (error) throw new Error(`duplicates: ${error.message}`);
    return count ?? 0;
  }

  async saveReport(kind: "agent" | "verification" | "ceo", taskId: string, agentId: string, body: unknown) {
    await must(this.db.from("growth_reports").upsert({ company_id: this.companyId, task_id: taskId, agent_id: agentId, kind, body }, { onConflict: "task_id,kind" }), "report");
  }

  async saveLearning(r: LearningRecord) {
    await must(this.db.from("growth_learning_records").insert({
      company_id: this.companyId, task_id: r.taskId, agent_id: r.agentId, skill_version: r.skillVersion, model: r.model,
      prompt_version: r.promptVersion, outcome: r.outcome, observation: r.observation, evidence: r.evidence ?? null,
      probable_cause: r.probableCause, proposed_change: r.proposedChange, expected_benefit: r.expectedBenefit, risk: r.risk,
    }), "learning");
  }

  ledger(task: GrowthTask): BudgetLedger {
    let taskSpent = 0;
    return {
      reserve: async (usd) => {
        if (taskSpent + usd > task.budgetUsd) return false;
        const ok = await must(this.db.rpc("growth_reserve_budget", { _company_id: this.companyId, _usd: usd }), "reserve");
        if (ok === true) taskSpent += usd;
        return ok === true;
      },
      settle: async (reserved, actual) => {
        taskSpent += (actual ?? reserved) - reserved;
        await must(this.db.rpc("growth_settle_budget", { _company_id: this.companyId, _reserved: reserved, _actual: actual }), "settle");
      },
    };
  }
}
