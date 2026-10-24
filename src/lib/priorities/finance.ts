import type { InvoiceWithCustomer } from '@/hooks/api/useFinance';
import { MS_DAY, type PriorityItem, type Tr } from './types';

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Days past due (positive) or until due (negative). Null when there is no due date. */
export function daysPastDue(inv: Pick<InvoiceWithCustomer, 'due_date'>, now: Date): number | null {
  if (!inv.due_date) return null;
  const due = new Date(inv.due_date);
  return Math.floor((startOfDay(now) - startOfDay(due)) / MS_DAY);
}

export function isOverdue(inv: Pick<InvoiceWithCustomer, 'status' | 'due_date'>, now: Date): boolean {
  if (inv.status === 'overdue') return true;
  if (inv.status !== 'sent') return false;
  const days = daysPastDue(inv, now);
  return days !== null && days > 0;
}

export function financePriorities(invoices: InvoiceWithCustomer[], base: string, fmt: (n: number) => string, tr: Tr, now: Date = new Date()): PriorityItem[] {
  const items: PriorityItem[] = [];
  const href = `${base}/finance/invoices`;
  let draftCount = 0;
  let draftValue = 0;

  for (const inv of invoices) {
    const customer = inv.customers?.name ?? '';
    const days = daysPastDue(inv, now);
    if (isOverdue(inv, now)) {
      const n = Math.max(days ?? 0, 1);
      items.push({ id: `od-${inv.id}`, tier: 1, score: n * 100 + inv.amount / 100, title: tr(customer ? 'sec.fin.overdueAt' : 'sec.fin.overdue', { no: inv.invoice_number, n, customer }), detail: fmt(inv.amount), href, cta: tr('sec.cta.sendReminder') });
    } else if (inv.status === 'sent' && days !== null && days <= 0 && days >= -7) {
      const n = Math.abs(days);
      items.push({ id: `due-${inv.id}`, tier: 2, score: 100 - n * 10 + inv.amount / 1000, title: tr(n === 0 ? 'sec.fin.dueToday' : 'sec.fin.dueSoon', { no: inv.invoice_number, n }), detail: customer ? `${customer} · ${fmt(inv.amount)}` : fmt(inv.amount), href, cta: tr('sec.cta.openInvoices') });
    } else if (inv.status === 'draft') {
      draftCount += 1;
      draftValue += inv.amount;
    }
  }

  if (draftCount > 0) items.push({ id: 'drafts', tier: 3, score: draftValue, title: tr('sec.fin.drafts', { n: draftCount }), detail: tr('sec.fin.draftsDetail', { value: fmt(draftValue) }), href, cta: tr('sec.cta.openInvoices') });
  if (invoices.length === 0) items.push({ id: 'first', tier: 3, score: 1, title: tr('sec.fin.noInvoices'), detail: tr('sec.fin.noInvoicesDetail'), href: `${href}?create=true`, cta: tr('sec.cta.createInvoice') });
  return items;
}

export interface AgingBucket { key: 'd7' | 'd30' | 'd30plus'; count: number; value: number }

export function agingBuckets(invoices: InvoiceWithCustomer[], now: Date = new Date()): AgingBucket[] {
  const buckets: AgingBucket[] = [{ key: 'd7', count: 0, value: 0 }, { key: 'd30', count: 0, value: 0 }, { key: 'd30plus', count: 0, value: 0 }];
  for (const inv of invoices) {
    if (!isOverdue(inv, now)) continue;
    const days = Math.max(daysPastDue(inv, now) ?? 1, 1);
    const b = days <= 7 ? buckets[0] : days <= 30 ? buckets[1] : buckets[2];
    b.count += 1;
    b.value += inv.amount;
  }
  return buckets;
}
