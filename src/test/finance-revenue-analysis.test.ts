import { describe, it, expect, vi } from "vitest";
import {
  revenueByMonth,
  revenueSummary,
  reconcileInvoices,
  proposeReconciliationReviews,
  type Payment,
  type InvoiceRef,
} from "@/mastra/agents/finance/revenue-analysis";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const payments: Payment[] = [
  { id: "p1", invoice_id: "i1", amount: 1000, paid_at: "2026-09-10T00:00:00Z" }, // recognized Sep
  { id: "p2", invoice_id: "i2", amount: 500, paid_at: "2026-10-05T00:00:00Z" }, // recognized Oct (partial of 800)
  { id: "p3", invoice_id: "i3", amount: 300, paid_at: "2026-10-06T00:00:00Z", reversed_at: "2026-10-07T00:00:00Z" }, // reversed
  { id: "p4", invoice_id: "i4", amount: 200, paid_at: null }, // not paid yet
  { id: "p5", invoice_id: "i5", amount: 1200, paid_at: "2026-10-08T00:00:00Z" }, // overpaid (invoice 1000)
];
const invoices: InvoiceRef[] = [
  { id: "i1", amount: 1000 },
  { id: "i2", amount: 800 },
  { id: "i4", amount: 200 },
  { id: "i5", amount: 1000 },
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("revenueByMonth / summary", () => {
  it("recognizes only paid, non-reversed payments, grouped by month", () => {
    expect(revenueByMonth(payments)).toEqual({ "2026-09": 1000, "2026-10": 1700 }); // 500 + 1200
  });
  it("summary excludes reversed from recognized and reports it separately", () => {
    const s = revenueSummary(payments);
    expect(s.recognizedTotal).toBe(2700); // 1000 + 500 + 1200
    expect(s.reversedTotal).toBe(300);
  });
});

describe("reconcileInvoices", () => {
  it("classifies each invoice against recognized payments", () => {
    const byId = Object.fromEntries(reconcileInvoices(invoices, payments).map((r) => [r.invoiceId, r.state]));
    expect(byId).toEqual({ i1: "fully_paid", i2: "partially_paid", i4: "unpaid", i5: "overpaid" });
  });
});

describe("proposeReconciliationReviews", () => {
  it("proposes a tasks.create review per discrepancy (partial/overpaid); nothing reversed", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const results = await proposeReconciliationReviews(proposer, invoices, payments);
    expect(seen.map((p) => p.idempotencyKey).sort()).toEqual(["fin-recon-i2", "fin-recon-i5"]);
    expect(seen.every((p) => p.actionName === "tasks.create")).toBe(true);
    expect(results).toHaveLength(2);
  });
});
