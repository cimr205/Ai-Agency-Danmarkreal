import { describe, it, expect, vi } from "vitest";
import {
  cycleTimes,
  stats,
  slowPaymentOutliers,
  proposeProcessReviews,
  type InvoiceTiming,
} from "@/mastra/agents/finance/process-metrics";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const iso = (d: string) => `${d}T00:00:00Z`;
const invoices: InvoiceTiming[] = [
  { id: "i1", created_at: iso("2026-09-01"), issued_at: iso("2026-09-02"), paid_at: iso("2026-09-12") }, // 10d pay
  { id: "i2", created_at: iso("2026-09-01"), issued_at: iso("2026-09-03"), paid_at: iso("2026-09-13") }, // 10d pay
  { id: "i3", created_at: iso("2026-09-01"), issued_at: iso("2026-09-02"), paid_at: iso("2026-12-01") }, // 90d pay → outlier
  { id: "i4", created_at: iso("2026-09-01"), issued_at: null, paid_at: null }, // not issued → excluded from cycles
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("cycleTimes", () => {
  it("computes create→issue and issue→pay only for invoices with the needed timestamps", () => {
    const ct = cycleTimes(invoices);
    expect(ct.createToIssue.map((e) => e.id)).toEqual(["i1", "i2", "i3"]); // i4 not issued
    expect(ct.issueToPay.find((e) => e.id === "i1")!.days).toBe(10);
    expect(ct.issueToPay.find((e) => e.id === "i3")!.days).toBe(90);
  });
});

describe("stats", () => {
  it("summarizes a sample (no fabrication on empty input)", () => {
    expect(stats([])).toEqual({ n: 0, avg: null, median: null, max: null });
    const s = stats([{ days: 10 }, { days: 10 }, { days: 90 }]);
    expect(s).toMatchObject({ n: 3, max: 90 });
    expect(s.avg).toBeCloseTo(36.7, 1);
  });
});

describe("slowPaymentOutliers", () => {
  it("flags only invoices above both the floor and avg*multiple", () => {
    const o = slowPaymentOutliers(invoices, { slowMultiple: 2, minSlowDays: 30 });
    expect(o.map((x) => x.id)).toEqual(["i3"]); // 90 > max(30, avg36.7*2=73.4)
  });
});

describe("proposeProcessReviews", () => {
  it("proposes a tasks.create review per outlier; nothing charged or changed", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const results = await proposeProcessReviews(proposer, invoices);
    expect(seen.map((p) => p.actionName)).toEqual(["tasks.create"]);
    expect(seen[0].idempotencyKey).toBe("fin-process-i3");
    expect(results).toHaveLength(1);
  });
});
