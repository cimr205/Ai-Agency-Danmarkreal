/**
 * Revenue analysis + payment reconciliation (read-only, propose-only).
 *
 * Works on real `payments` (amount, invoice_id, paid_at, reversed_at) and
 * `invoices` (amount). Recognizes revenue from payments that are paid and not
 * reversed, groups it by month, and reconciles each invoice against its payments.
 * No fabricated numbers; reversed payments are excluded, not hidden. Reconciliation
 * discrepancies are surfaced as `tasks.create` review DRAFTs — nothing is written,
 * no payment is taken or reversed.
 */
import type { createActionProposer } from "../../tools/action-proposal.ts";

export interface Payment {
  id: string;
  invoice_id: string;
  amount: number;
  paid_at?: string | null;
  reversed_at?: string | null;
}

export interface InvoiceRef {
  id: string;
  amount: number;
  customer_id?: string;
}

/** True when a payment counts as recognized revenue (paid and not reversed). */
export function isRecognized(p: Payment): boolean {
  return Boolean(p.paid_at) && !p.reversed_at;
}

/** Recognized revenue grouped by YYYY-MM of paid_at. */
export function revenueByMonth(payments: Payment[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of payments) {
    if (!isRecognized(p)) continue;
    const month = p.paid_at!.slice(0, 7); // YYYY-MM
    out[month] = Math.round(((out[month] ?? 0) + p.amount) * 100) / 100;
  }
  return out;
}

export interface RevenueSummary {
  recognizedTotal: number;
  reversedTotal: number;
  byMonth: Record<string, number>;
}

export function revenueSummary(payments: Payment[]): RevenueSummary {
  let recognizedTotal = 0;
  let reversedTotal = 0;
  for (const p of payments) {
    if (isRecognized(p)) recognizedTotal += p.amount;
    else if (p.reversed_at) reversedTotal += p.amount;
  }
  return {
    recognizedTotal: Math.round(recognizedTotal * 100) / 100,
    reversedTotal: Math.round(reversedTotal * 100) / 100,
    byMonth: revenueByMonth(payments),
  };
}

export type ReconState = "fully_paid" | "partially_paid" | "unpaid" | "overpaid";

export interface Reconciliation {
  invoiceId: string;
  invoiceAmount: number;
  paidAmount: number;
  state: ReconState;
}

/** Reconcile each invoice against its recognized payments. */
export function reconcileInvoices(invoices: InvoiceRef[], payments: Payment[]): Reconciliation[] {
  const paidByInvoice = new Map<string, number>();
  for (const p of payments) {
    if (!isRecognized(p)) continue;
    paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) ?? 0) + p.amount);
  }
  return invoices.map((inv) => {
    const paid = Math.round((paidByInvoice.get(inv.id) ?? 0) * 100) / 100;
    let state: ReconState;
    if (paid === 0) state = "unpaid";
    else if (paid < inv.amount) state = "partially_paid";
    else if (paid > inv.amount) state = "overpaid";
    else state = "fully_paid";
    return { invoiceId: inv.id, invoiceAmount: inv.amount, paidAmount: paid, state };
  });
}

type Proposer = ReturnType<typeof createActionProposer>;

/** Propose a review tasks.create DRAFT per reconciliation discrepancy (partial/overpaid). */
export async function proposeReconciliationReviews(proposer: Proposer, invoices: InvoiceRef[], payments: Payment[]) {
  const discrepancies = reconcileInvoices(invoices, payments).filter(
    (r) => r.state === "partially_paid" || r.state === "overpaid",
  );
  const results = [];
  for (const r of discrepancies) {
    results.push(
      await proposer.propose({
        actionName: "tasks.create",
        input: {
          title: `Reconcile invoice ${r.invoiceId} (${r.state})`,
          description: `Invoice amount ${r.invoiceAmount}, recognized payments ${r.paidAmount} (${r.state}). Review and reconcile. (Proposed by the Finance agent; approve to create the task. No payment is taken or reversed automatically.)`,
          invoice_id: r.invoiceId,
        },
        reason: `Payment reconciliation: ${r.state}`,
        idempotencyKey: `fin-recon-${r.invoiceId}`,
      }),
    );
  }
  return results;
}
