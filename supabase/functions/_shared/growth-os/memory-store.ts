// In-memory GrowthStore for tests and local dry runs. Same contract as the
// Supabase store; the budget ledger is atomic within the process.
import type { ActivityEvent, GrowthStore, GrowthTask, LearningRecord } from "./engine.ts";
import type { BudgetLedger, UsageRecord } from "./openrouter.ts";

export class MemoryStore implements GrowthStore {
  events: ActivityEvent[] = [];
  usages: (UsageRecord & { taskId: string; agentId: string })[] = [];
  reports: { kind: string; taskId: string; agentId: string; body: unknown }[] = [];
  learnings: LearningRecord[] = [];
  scores = new Map<string, number>();
  duplicates = 0;
  spentUsd = 0;
  constructor(public dailyBudgetUsd = 1) {}

  activity(e: ActivityEvent) { this.events.push(e); return Promise.resolve(); }
  usage(taskId: string, agentId: string, u: UsageRecord) { this.usages.push({ ...u, taskId, agentId }); return Promise.resolve(); }
  previousScore(companyId: string, agentId: string, url: string) { return Promise.resolve(this.scores.get(`${companyId}|${agentId}|${url}`) ?? null); }
  openDuplicateTasks(_t: GrowthTask) { return Promise.resolve(this.duplicates); }
  saveReport(kind: "agent" | "verification" | "ceo", taskId: string, agentId: string, body: unknown) { this.reports.push({ kind, taskId, agentId, body }); return Promise.resolve(); }
  saveLearning(r: LearningRecord) { this.learnings.push(r); return Promise.resolve(); }
  ledger(task: GrowthTask): BudgetLedger {
    let taskSpent = 0;
    return {
      reserve: (usd) => {
        if (this.spentUsd + usd > this.dailyBudgetUsd || taskSpent + usd > task.budgetUsd) return Promise.resolve(false);
        this.spentUsd += usd; taskSpent += usd;
        return Promise.resolve(true);
      },
      settle: (reserved, actual) => {
        const delta = (actual ?? reserved) - reserved;
        this.spentUsd += delta; taskSpent += delta;
        return Promise.resolve();
      },
    };
  }
}
