import { describe, it, expect, vi } from "vitest";
import {
  compareOffering,
  pricingReviews,
  proposePricingReviews,
  type OwnOffering,
  type CompetitorPrice,
} from "@/mastra/agents/marketing/competitor-analysis";
import { createActionProposer, type ActionProposal, type SubmitResult } from "@/mastra/tools/action-proposal";

const own: OwnOffering[] = [
  { product: "CRM Starter", priceExclVat: 1000, currency: "DKK", vatRate: 0.25 }, // above median → review
  { product: "CRM Pro", priceExclVat: 2000, currency: "DKK", vatRate: 0.25 }, // around median → no review
];
const competitors: CompetitorPrice[] = [
  { competitor: "A", product: "CRM Starter", priceExclVat: 700, currency: "DKK", source: "https://a.dk/pris", sourceDate: "2026-10-10" },
  { competitor: "B", product: "CRM Starter", priceExclVat: 800, currency: "DKK", source: "https://b.dk/pris", sourceDate: "2026-10-12" },
  { competitor: "C", product: "CRM Starter", priceExclVat: 500, currency: "EUR", source: "https://c.eu/price", sourceDate: "2026-10-01" }, // diff currency → ignored
  { competitor: "A", product: "CRM Pro", priceExclVat: 2000, currency: "DKK", source: "https://a.dk/pris", sourceDate: "2026-10-10" },
  { competitor: "B", product: "CRM Pro", priceExclVat: 2100, currency: "DKK", source: "https://b.dk/pris", sourceDate: "2026-10-12" },
];

function recordingSubmit() {
  const seen: ActionProposal[] = [];
  const submit = vi.fn(async (p: ActionProposal): Promise<SubmitResult> => {
    seen.push(p);
    return { id: `act_${seen.length}`, status: "awaiting_approval" };
  });
  return { seen, submit };
}

describe("compareOffering", () => {
  it("compares same-currency only, keeps sources, ignores different currency, computes incl-VAT", () => {
    const row = compareOffering(own[0], competitors);
    expect(row.comparableCompetitors.map((c) => c.competitor)).toEqual(["A", "B"]);
    expect(row.comparableCompetitors[0].source).toBe("https://a.dk/pris");
    expect(row.ignoredDifferentCurrency.map((c) => c.competitor)).toEqual(["C"]);
    expect(row.medianCompetitorExclVat).toBe(750); // median(700,800)
    expect(row.ownPriceInclVat).toBe(1250); // 1000 * 1.25
    expect(row.position).toBe("most_expensive"); // 1000 >= max(700,800)
  });
});

describe("pricingReviews", () => {
  it("flags gaps beyond the threshold as reviews; leaves near-median alone", () => {
    const rows = own.map((o) => compareOffering(o, competitors));
    const reviews = pricingReviews(rows, { reviewGap: 0.15 });
    expect(reviews.map((r) => r.product)).toEqual(["CRM Starter"]); // Pro is at/below median
    expect(reviews[0].gapVsMedian).toBeGreaterThan(0.15);
  });
});

describe("proposePricingReviews", () => {
  it("proposes tasks.create review DRAFTs only; prices never changed", async () => {
    const { seen, submit } = recordingSubmit();
    const proposer = createActionProposer(submit, () => "DRAFT_APPROVAL");
    const results = await proposePricingReviews(proposer, own, competitors);
    expect(seen.map((p) => p.actionName)).toEqual(["tasks.create"]);
    expect(seen[0].idempotencyKey).toBe("mkt-pricing-crm-starter");
    expect(results).toHaveLength(1);
  });
});
