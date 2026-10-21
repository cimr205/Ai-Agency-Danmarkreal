/**
 * Process-optimization metrics from actual data (read-only, propose-only).
 *
 * Computes invoice lifecycle cycle times from REAL invoice timestamps
 * (created_at → issued_at → paid_at) and flags slow outliers. Grounded only in the
 * supplied rows — no fabricated benchmarks. Outliers are surfaced as `tasks.create`
 * review DRAFTs for process improvement; nothing is written and no invoice/payment
 * is touched.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

export interface InvoiceTiming {
  id: string;
  created_at: string;
  issued_at?: string | null;
  paid_at?: string | null;
}

const DAY_MS = 86_400_000;

function daysBetween(a: string, b: string): number {
  return Math.round(((Date.parse(b) - Date.parse(a)) / DAY_MS) * 10) / 10;
}

export interface CycleTimes {
  /** days created_at → issued_at, for invoices that have both. */
  createToIssue: Array<{ id: string; days: number }>;
  /** days issued_at → paid_at, for invoices that have both. */
  issueToPay: Array<{ id: string; days: number }>;
}

export function cycleTimes(invoices: InvoiceTiming[]): CycleTimes {
  const createToIssue: Array<{ id: string; days: number }> = [];
  const issueToPay: Array<{ id: string; days: number }> = [];
  for (const inv of invoices) {
    if (inv.issued_at) createToIssue.push({ id: inv.id, days: daysBetween(inv.created_at, inv.issued_at) });
    if (inv.issued_at && inv.paid_at) issueToPay.push({ id: inv.id, days: daysBetween(inv.issued_at, inv.paid_at) });
  }
  return { createToIssue, issueToPay };
}

export interface Stats {
  n: number;
  avg: number | null;
  median: number | null;
  max: number | null;
}

export function stats(entries: Array<{ days: number }>): Stats {
  if (!entries.length) return { n: 0, avg: null, median: null, max: null };
  const xs = entries.map((e) => e.days).sort((a, b) => a - b);
  const sum = xs.reduce((a, b) => a + b, 0);
  const m = Math.floor(xs.length / 2);
  const median = xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2;
  return {
    n: xs.length,
    avg: Math.round((sum / xs.length) * 10) / 10,
    median: Math.round(median * 10) / 10,
    max: xs[xs.length - 1],
  };
}

export interface ProcessOptions {
  /** Flag issue→pay invoices slower than avg * this multiple. Default 2. */
  slowMultiple?: number;
  /** Absolute floor (days) before a slow flag applies, so tiny samples don't over-flag. Default 30. */
  minSlowDays?: number;
}

export interface Outlier {
  id: string;
  metric: "issue_to_pay";
  days: number;
  rationale: string;
}

/** Invoices whose issue→pay time is both above the floor AND above avg*multiple. */
export function slowPaymentOutliers(invoices: InvoiceTiming[], opts: ProcessOptions = {}): Outlier[] {
  const mult = opts.slowMultiple ?? 2;
  const floor = opts.minSlowDays ?? 30;
  const { issueToPay } = cycleTimes(invoices);
  const s = stats(issueToPay);
  if (s.avg == null) return [];
  const threshold = Math.max(floor, s.avg * mult);
  return issueToPay
    .filter((e) => e.days > threshold)
    .sort((a, b) => b.days - a.days)
    .map((e) => ({
      id: e.id,
      metric: "issue_to_pay" as const,
      days: e.days,
      rationale: `Issue→pay ${e.days}d exceeds threshold ${Math.round(threshold * 10) / 10}d (avg ${s.avg}d × ${mult}, floor ${floor}d).`,
    }));
}

type Proposer = ReturnType<typeof createActionProposer>;

/** Propose a tasks.create process-review DRAFT per slow-payment outlier. Nothing written/charged. */
export async function proposeProcessReviews(proposer: Proposer, invoices: InvoiceTiming[], opts: ProcessOptions = {}) {
  const results = [];
  for (const o of slowPaymentOutliers(invoices, opts)) {
    results.push(
      await proposer.propose({
        actionName: "tasks.create",
        input: {
          title: `Slow-paying invoice ${o.id}: ${o.days}d to pay`,
          description: `${o.rationale} Review the collection process for this invoice (terms, reminders, customer). (Proposed by the Finance agent; approve to create the task. Read-only analysis — no payment is taken and no invoice changed.)`,
          invoice_id: o.id,
        },
        reason: `Process outlier: slow payment (${o.days}d)`,
        idempotencyKey: `fin-process-${o.id}`,
      }),
    );
  }
  return results;
}
