/**
 * Deadline monitor + "work completed → invoice basis" preparer (read-only, propose-only).
 *
 * Operates on real `tasks` rows (due_date, status, completed_at, deal_id, assigned_to).
 * Detects overdue and soon-due tasks and groups completed, deal-linked work into an
 * invoice basis. It proposes review/reschedule DRAFTs via the bridge — it never
 * reschedules automatically, never issues an invoice, never contacts a customer.
 * Invoice issuing stays a separate, explicitly-approved step.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

export interface Task {
  id: string;
  title: string;
  status: string; // task_status enum; compared case-insensitively
  due_date?: string | null;
  completed_at?: string | null;
  deal_id?: string | null;
  assigned_to?: string | null;
  archived?: boolean;
}

export interface MonitorOptions {
  /** Statuses considered done. Default done/completed/closed. */
  doneStatuses?: string[];
  /** Window (days) for "due soon". Default 3. */
  dueSoonDays?: number;
  now?: number;
}

const DAY_MS = 86_400_000;

function isDone(t: Task, done: string[]): boolean {
  return Boolean(t.completed_at) || done.includes(t.status.toLowerCase());
}

export function daysUntilDue(t: Task, now: number): number | null {
  if (!t.due_date) return null;
  return Math.floor((Date.parse(t.due_date) - now) / DAY_MS);
}

/** Not-done, not-archived tasks whose due date is in the past; most overdue first. */
export function overdueTasks(tasks: Task[], opts: MonitorOptions = {}): Task[] {
  const done = (opts.doneStatuses ?? ["done", "completed", "closed"]).map((s) => s.toLowerCase());
  const now = opts.now ?? Date.now();
  return tasks
    .filter((t) => !t.archived && !isDone(t, done) && t.due_date != null && (daysUntilDue(t, now) ?? 0) < 0)
    .sort((a, b) => (daysUntilDue(a, now)! - daysUntilDue(b, now)!));
}

/** Not-done tasks due within the window (inclusive of today). */
export function dueSoon(tasks: Task[], opts: MonitorOptions = {}): Task[] {
  const done = (opts.doneStatuses ?? ["done", "completed", "closed"]).map((s) => s.toLowerCase());
  const now = opts.now ?? Date.now();
  const window = opts.dueSoonDays ?? 3;
  return tasks.filter((t) => {
    if (t.archived || isDone(t, done) || t.due_date == null) return false;
    const d = daysUntilDue(t, now)!;
    return d >= 0 && d <= window;
  });
}

export interface InvoiceBasis {
  dealId: string;
  completedTaskIds: string[];
  completedTaskCount: number;
}

/** Group completed, deal-linked tasks into a per-deal invoice basis (no amounts invented). */
export function invoiceBasisFromCompletedWork(tasks: Task[], opts: MonitorOptions = {}): InvoiceBasis[] {
  const done = (opts.doneStatuses ?? ["done", "completed", "closed"]).map((s) => s.toLowerCase());
  const byDeal = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.deal_id || !isDone(t, done)) continue;
    (byDeal.get(t.deal_id) ?? byDeal.set(t.deal_id, []).get(t.deal_id)!).push(t.id);
  }
  return [...byDeal.entries()].map(([dealId, ids]) => ({
    dealId,
    completedTaskIds: ids,
    completedTaskCount: ids.length,
  }));
}

type Proposer = ReturnType<typeof createActionProposer>;

/** Propose a reschedule/follow-up tasks.create DRAFT for each overdue task. Never reschedules automatically. */
export async function proposeOverdueFollowups(proposer: Proposer, tasks: Task[], opts: MonitorOptions = {}) {
  const now = opts.now ?? Date.now();
  const results = [];
  for (const t of overdueTasks(tasks, opts)) {
    const days = -(daysUntilDue(t, now)!);
    results.push(
      await proposer.propose({
        actionName: "tasks.create",
        input: {
          title: `Overdue: ${t.title} (${days}d late)`,
          description: `Task "${t.title}" is ${days} days overdue. Propose a reschedule or a customer update. (Proposed by the Operations agent; approve to create. Nothing is rescheduled or sent automatically.)`,
        },
        reason: `Task ${days} days overdue`,
        idempotencyKey: `ops-overdue-${t.id}`,
      }),
    );
  }
  return results;
}

/** Propose a "prepare invoice basis" review tasks.create DRAFT per deal with completed work. Never issues an invoice. */
export async function proposeInvoiceBasisReviews(proposer: Proposer, tasks: Task[], opts: MonitorOptions = {}) {
  const results = [];
  for (const basis of invoiceBasisFromCompletedWork(tasks, opts)) {
    results.push(
      await proposer.propose({
        actionName: "tasks.create",
        input: {
          title: `Prepare invoice basis for deal ${basis.dealId} (${basis.completedTaskCount} completed tasks)`,
          description: `Completed, verified work tasks for deal ${basis.dealId}: ${basis.completedTaskIds.join(", ")}. Review and prepare an invoice draft. (Proposed by the Finance agent; approve to create the review task. No invoice is issued automatically; amounts must be set by a human.)`,
          deal_id: basis.dealId,
        },
        reason: `Completed work ready for invoicing (deal ${basis.dealId})`,
        idempotencyKey: `fin-invoicebasis-${basis.dealId}`,
      }),
    );
  }
  return results;
}
