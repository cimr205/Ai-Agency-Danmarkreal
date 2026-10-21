/**
 * Overdue-invoice detector + dunning-draft proposer + read-only cashflow projection
 * (all read-only / propose-only).
 *
 * Operates on `invoices` rows already in the system (real fields: amount, status,
 * due_date, paid_at). Never sends email, never captures payment, never pushes to
 * e-conomic/Dinero. Reminder drafts are proposed as `tasks.create` DRAFTs through
 * the propose-only bridge; the owner approves before anything happens.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

export interface Invoice {
  id: string;
  invoice_number?: string;
  amount: number;
  status: string; // invoice_status enum: draft/sent/paid/overdue/… (compared case-insensitively)
  due_date?: string | null; // ISO date
  paid_at?: string | null;
  customer_id?: string;
}

export interface OverdueOptions {
  /** Statuses considered settled (not chaseable). Default paid/cancelled/credited. */
  settledStatuses?: string[];
  /** "Now" for deterministic tests. Default Date.now(). */
  now?: number;
}

const DAY_MS = 86_400_000;

function isSettled(inv: Invoice, settled: string[]): boolean {
  return settled.includes(inv.status.toLowerCase()) || Boolean(inv.paid_at);
}

export function daysOverdue(inv: Invoice, now: number): number {
  if (!inv.due_date) return 0;
  return Math.floor((now - Date.parse(inv.due_date)) / DAY_MS);
}

export type AgingBucket = "current" | "1-30" | "31-60" | "60+";

export function agingBucket(days: number): AgingBucket {
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  return "60+";
}

/** Unsettled invoices past their due date, most overdue first. */
export function overdueInvoices(invoices: Invoice[], opts: OverdueOptions = {}): Invoice[] {
  const settled = (opts.settledStatuses ?? ["paid", "cancelled", "credited"]).map((s) => s.toLowerCase());
  const now = opts.now ?? Date.now();
  return invoices
    .filter((inv) => !isSettled(inv, settled) && inv.due_date != null && daysOverdue(inv, now) > 0)
    .sort((a, b) => daysOverdue(b, now) - daysOverdue(a, now));
}

export interface CashflowProjection {
  outstandingTotal: number;
  overdueTotal: number;
  byBucket: Record<AgingBucket, { count: number; amount: number }>;
}

/** Read-only cashflow/aging projection grounded only in the provided rows. No fabricated numbers. */
export function cashflowProjection(invoices: Invoice[], opts: OverdueOptions = {}): CashflowProjection {
  const settled = (opts.settledStatuses ?? ["paid", "cancelled", "credited"]).map((s) => s.toLowerCase());
  const now = opts.now ?? Date.now();
  const byBucket: Record<AgingBucket, { count: number; amount: number }> = {
    current: { count: 0, amount: 0 },
    "1-30": { count: 0, amount: 0 },
    "31-60": { count: 0, amount: 0 },
    "60+": { count: 0, amount: 0 },
  };
  let outstandingTotal = 0;
  let overdueTotal = 0;
  for (const inv of invoices) {
    if (isSettled(inv, settled)) continue;
    outstandingTotal += inv.amount;
    const days = daysOverdue(inv, now);
    const bucket = agingBucket(days);
    byBucket[bucket].count += 1;
    byBucket[bucket].amount += inv.amount;
    if (days > 0) overdueTotal += inv.amount;
  }
  return { outstandingTotal, overdueTotal, byBucket };
}

type Proposer = ReturnType<typeof createActionProposer>;

/** Propose a reminder (dunning) `tasks.create` DRAFT per overdue invoice. No email sent. */
export async function proposeDunningDrafts(proposer: Proposer, invoices: Invoice[], opts: OverdueOptions = {}) {
  const now = opts.now ?? Date.now();
  const results = [];
  for (const inv of overdueInvoices(invoices, opts)) {
    const days = daysOverdue(inv, now);
    results.push(
      await proposer.propose({
        actionName: "tasks.create",
        input: {
          title: `Payment reminder: invoice ${inv.invoice_number ?? inv.id} (${days}d overdue)`,
          description: `Invoice ${inv.invoice_number ?? inv.id} for ${inv.amount} is ${days} days overdue (bucket ${agingBucket(days)}). Prepare a reminder to the customer. (Proposed by the Finance agent; approve to create the task. No email is sent and no payment is taken automatically.)`,
          invoice_id: inv.id,
        },
        reason: `Invoice ${days} days overdue`,
        idempotencyKey: `fin-dunning-${inv.id}`,
      }),
    );
  }
  return results;
}
