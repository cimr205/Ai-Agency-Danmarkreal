import { describe, it, expect, vi } from "vitest";
import {
  overdueTasks,
  dueSoon,
  invoiceBasisFromCompletedWork,
  proposeOverdueFollowups,
  proposeInvoiceBasisReviews,
  type Task,
} from "@/mastra/agents/finance/deadline-monitor";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const day = (n: number) => new Date(NOW + n * 86_400_000).toISOString().slice(0, 10);

const tasks: Task[] = [
  { id: "t1", title: "Late A", status: "in_progress", due_date: day(-5) }, // overdue 5
  { id: "t2", title: "Late B", status: "todo", due_date: day(-1) }, // overdue 1
  { id: "t3", title: "Soon", status: "todo", due_date: day(2) }, // due soon
  { id: "t4", title: "Done late", status: "done", due_date: day(-10), completed_at: day(-9) }, // done, ignored
  { id: "t5", title: "Archived", status: "todo", due_date: day(-3), archived: true }, // archived, ignored
  { id: "t6", title: "Work X", status: "completed", deal_id: "d1", completed_at: day(-2) },
  { id: "t7", title: "Work Y", status: "completed", deal_id: "d1", completed_at: day(-1) },
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("overdueTasks", () => {
  it("returns not-done, not-archived, past-due tasks, most overdue first", () => {
    expect(overdueTasks(tasks, { now: NOW }).map((t) => t.id)).toEqual(["t1", "t2"]);
  });
  it("excludes done and archived tasks", () => {
    const ids = overdueTasks(tasks, { now: NOW }).map((t) => t.id);
    expect(ids).not.toContain("t4");
    expect(ids).not.toContain("t5");
  });
});

describe("dueSoon", () => {
  it("returns not-done tasks due within the window", () => {
    expect(dueSoon(tasks, { now: NOW, dueSoonDays: 3 }).map((t) => t.id)).toEqual(["t3"]);
  });
});

describe("invoiceBasisFromCompletedWork", () => {
  it("groups completed deal-linked work per deal (no amounts invented)", () => {
    const basis = invoiceBasisFromCompletedWork(tasks, { now: NOW });
    expect(basis).toHaveLength(1);
    expect(basis[0]).toMatchObject({ dealId: "d1", completedTaskCount: 2 });
    expect(basis[0].completedTaskIds.sort()).toEqual(["t6", "t7"]);
  });
});

describe("proposals", () => {
  it("overdue follow-ups: a tasks.create DRAFT each, idempotency keyed; nothing rescheduled", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const results = await proposeOverdueFollowups(proposer, tasks, { now: NOW });
    expect(seen.map((p) => p.idempotencyKey)).toEqual(["ops-overdue-t1", "ops-overdue-t2"]);
    expect(seen.every((p) => p.actionName === "tasks.create")).toBe(true);
    expect(results).toHaveLength(2);
  });

  it("invoice basis: a review tasks.create DRAFT per deal; never invoice.create automatically", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    await proposeInvoiceBasisReviews(proposer, tasks, { now: NOW });
    expect(seen.map((p) => p.actionName)).toEqual(["tasks.create"]);
    expect(seen.some((p) => p.actionName === "invoice.create")).toBe(false);
    expect(seen[0].idempotencyKey).toBe("fin-invoicebasis-d1");
  });
});
