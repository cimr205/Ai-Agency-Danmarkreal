import { describe, it, expect, vi } from "vitest";
import {
  overdueInvoices,
  cashflowProjection,
  agingBucket,
  daysOverdue,
  proposeDunningDrafts,
  type Invoice,
} from "@/mastra/agents/finance/overdue-invoices";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const dueDaysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const invoices: Invoice[] = [
  { id: "a", invoice_number: "1001", amount: 1000, status: "sent", due_date: dueDaysAgo(70) }, // 60+
  { id: "b", invoice_number: "1002", amount: 500, status: "sent", due_date: dueDaysAgo(10) }, // 1-30
  { id: "c", invoice_number: "1003", amount: 2000, status: "sent", due_date: dueDaysAgo(-5) }, // not due yet
  { id: "d", invoice_number: "1004", amount: 9999, status: "paid", due_date: dueDaysAgo(90), paid_at: dueDaysAgo(80) }, // settled
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("overdueInvoices", () => {
  it("returns unsettled, past-due invoices, most overdue first", () => {
    expect(overdueInvoices(invoices, { now: NOW }).map((i) => i.id)).toEqual(["a", "b"]);
  });
  it("excludes paid/settled invoices even if the due date is long past", () => {
    expect(overdueInvoices(invoices, { now: NOW }).some((i) => i.id === "d")).toBe(false);
  });
  it("aging buckets are deterministic", () => {
    expect(agingBucket(0)).toBe("current");
    expect(agingBucket(70)).toBe("60+");
    expect(daysOverdue(invoices[0], NOW)).toBe(70);
  });
});

describe("cashflowProjection", () => {
  it("sums only unsettled invoices into the right buckets — no fabricated numbers", () => {
    const p = cashflowProjection(invoices, { now: NOW });
    expect(p.outstandingTotal).toBe(3500); // a+b+c (d is paid)
    expect(p.overdueTotal).toBe(1500); // a+b
    expect(p.byBucket["60+"]).toEqual({ count: 1, amount: 1000 });
    expect(p.byBucket["1-30"]).toEqual({ count: 1, amount: 500 });
    expect(p.byBucket.current).toEqual({ count: 1, amount: 2000 }); // c not yet due
  });
});

describe("proposeDunningDrafts", () => {
  it("proposes a tasks.create reminder DRAFT per overdue invoice; no email, no payment", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const results = await proposeDunningDrafts(proposer, invoices, { now: NOW });
    expect(seen.map((p) => p.actionName)).toEqual(["tasks.create", "tasks.create"]);
    expect(seen.map((p) => p.idempotencyKey)).toEqual(["fin-dunning-a", "fin-dunning-b"]);
    expect(seen.every((p) => p.actionName !== "email.send")).toBe(true);
    expect(results).toHaveLength(2);
  });
});
