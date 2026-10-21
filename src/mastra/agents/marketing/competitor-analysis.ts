/**
 * Competitor price analysis in a chosen market (read-only, propose-only).
 *
 * Compares the company's own offerings against competitor data points that each
 * carry an explicit SOURCE and SOURCE DATE (verifiable; no invented figures and no
 * live scraping — inputs are supplied, source-tagged). VAT and currency are noted;
 * prices in a different currency are NOT silently converted (flagged instead).
 * Price changes are only ever surfaced as review proposals — never applied.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

export interface OwnOffering {
  product: string;
  priceExclVat: number;
  currency: string; // e.g. "DKK"
  vatRate: number; // e.g. 0.25
}

export interface CompetitorPrice {
  competitor: string;
  product: string;
  priceExclVat: number;
  currency: string;
  vatRate?: number;
  source: string; // URL / document — required, verifiable
  sourceDate: string; // ISO date the price was observed — required
}

export type PricePosition = "cheapest" | "below_median" | "around_median" | "above_median" | "most_expensive";

export interface ComparisonRow {
  product: string;
  ownPriceExclVat: number;
  ownPriceInclVat: number;
  currency: string;
  comparableCompetitors: Array<{ competitor: string; priceExclVat: number; source: string; sourceDate: string }>;
  ignoredDifferentCurrency: Array<{ competitor: string; currency: string; source: string }>;
  medianCompetitorExclVat: number | null;
  position: PricePosition | "no_comparables";
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Compare one own offering against competitor data points in the SAME currency only. */
export function compareOffering(own: OwnOffering, competitors: CompetitorPrice[]): ComparisonRow {
  const forProduct = competitors.filter((c) => c.product.toLowerCase() === own.product.toLowerCase());
  const comparable = forProduct.filter((c) => c.currency.toUpperCase() === own.currency.toUpperCase());
  const ignored = forProduct
    .filter((c) => c.currency.toUpperCase() !== own.currency.toUpperCase())
    .map((c) => ({ competitor: c.competitor, currency: c.currency, source: c.source }));

  const prices = comparable.map((c) => c.priceExclVat);
  const med = prices.length ? median(prices) : null;

  let position: ComparisonRow["position"] = "no_comparables";
  if (med != null) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (own.priceExclVat <= min) position = "cheapest";
    else if (own.priceExclVat >= max) position = "most_expensive";
    else if (own.priceExclVat < med) position = "below_median";
    else if (own.priceExclVat > med) position = "above_median";
    else position = "around_median";
  }

  return {
    product: own.product,
    ownPriceExclVat: own.priceExclVat,
    ownPriceInclVat: Math.round(own.priceExclVat * (1 + own.vatRate) * 100) / 100,
    currency: own.currency,
    comparableCompetitors: comparable.map((c) => ({
      competitor: c.competitor,
      priceExclVat: c.priceExclVat,
      source: c.source,
      sourceDate: c.sourceDate,
    })),
    ignoredDifferentCurrency: ignored,
    medianCompetitorExclVat: med,
    position,
  };
}

export interface PricingOptions {
  /** Relative gap vs median that warrants a human review. Default 0.15 (15%). */
  reviewGap?: number;
}

export interface PricingReview {
  product: string;
  position: PricePosition;
  gapVsMedian: number; // signed fraction
  rationale: string;
}

/** Flag offerings that are far from the competitor median — as REVIEWS, never changes. */
export function pricingReviews(rows: ComparisonRow[], opts: PricingOptions = {}): PricingReview[] {
  const gap = opts.reviewGap ?? 0.15;
  const reviews: PricingReview[] = [];
  for (const r of rows) {
    if (r.medianCompetitorExclVat == null || r.position === "no_comparables") continue;
    const diff = (r.ownPriceExclVat - r.medianCompetitorExclVat) / r.medianCompetitorExclVat;
    if (Math.abs(diff) >= gap) {
      reviews.push({
        product: r.product,
        position: r.position as PricePosition,
        gapVsMedian: Math.round(diff * 1000) / 1000,
        rationale: `Own price is ${(diff * 100).toFixed(1)}% ${diff > 0 ? "above" : "below"} the competitor median (${r.medianCompetitorExclVat} ${r.currency}, from ${r.comparableCompetitors.length} sourced data points).`,
      });
    }
  }
  return reviews;
}

type Proposer = ReturnType<typeof createActionProposer>;

/** Propose a tasks.create review DRAFT per pricing gap. Price changes stay proposals — never applied. */
export async function proposePricingReviews(
  proposer: Proposer,
  own: OwnOffering[],
  competitors: CompetitorPrice[],
  opts: PricingOptions = {},
) {
  const rows = own.map((o) => compareOffering(o, competitors));
  const results = [];
  for (const rev of pricingReviews(rows, opts)) {
    results.push(
      await proposer.propose({
        actionName: "tasks.create",
        input: {
          title: `Pricing review: ${rev.product} (${rev.position})`,
          description: `${rev.rationale} Review whether to adjust. (Proposed by the Marketing agent; approve to create the review task. No price is changed automatically — price changes require a separate owner decision.)`,
        },
        reason: `Pricing gap vs competitor median: ${(rev.gapVsMedian * 100).toFixed(1)}%`,
        idempotencyKey: `mkt-pricing-${rev.product}`.toLowerCase().replace(/\s+/g, "-"),
      }),
    );
  }
  return results;
}
