import { describe, expect, it } from 'vitest';
import { crmPriorities } from '@/lib/priorities/crm';
import { marketingPriorities } from '@/lib/priorities/marketing';
import { agingBuckets, financePriorities, isOverdue } from '@/lib/priorities/finance';
import { hrPriorities, isWorkingHours } from '@/lib/priorities/hr';
import { controlPriorities } from '@/lib/priorities/control';
import { interpolate, itemsInTier, signalNote, type PriorityItem, type Tr } from '@/lib/priorities/types';
import type { DashboardSummary } from '@/hooks/api/useDashboard';
import type { InvoiceWithCustomer } from '@/hooks/api/useFinance';
import type { MetaCampaignSummary } from '@/hooks/api/useMetaAdsData';
import type { Integration } from '@/hooks/api/useIntegrations';
import type { AutopilotAction } from '@/hooks/api/useAutopilot';

// Echoes the key and its variables so tests can assert on logic, not copy.
const tr: Tr = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
const fmt = (n: number) => `${n}kr`;
const BASE = '/da/app';

function dash(over: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    leads: { total: 10, new: 0, qualified: 0, contacted: 0, newThisMonth: 3 },
    deals: { total: 4, value: 0, won: 1, lost: 0, wonValue: 0, openValue: 0 },
    employees: { total: 5, active: 5 },
    tasks: { pending: 0, completed: 0, inProgress: 0 },
    emails: { total: 0, unread: 0 },
    pipeline: { stages: [] },
    customers: { total: 0 },
    invoices: { total: 0, paid: 0, overdue: 0, totalValue: 0, overdueValue: 0, monthValue: 0, lastMonthValue: 0 },
    revenueByDay: [],
    trends: { leads: [], deals: [], won: [] },
    today: { meetings: [], tasks: [] },
    followUps: [],
    focusItems: [],
    ...over,
  };
}

describe('priority helpers', () => {
  it('interpolates placeholders and keeps unknown ones', () => {
    expect(interpolate('{n} of {x}', { n: 3 })).toBe('3 of {x}');
  });

  it('sorts a tier by score, highest first', () => {
    const mk = (id: string, tier: 1 | 2 | 3, score: number): PriorityItem => ({ id, tier, score, title: id, detail: '', href: '', cta: '' });
    const out = itemsInTier([mk('a', 1, 1), mk('b', 1, 9), mk('c', 2, 5)], 1);
    expect(out.map(i => i.id)).toEqual(['b', 'a']);
  });

  it('signal note leads with urgent items, then today, then all clear', () => {
    const mk = (tier: 1 | 2 | 3): PriorityItem => ({ id: String(tier), tier, score: 1, title: `t${tier}`, detail: '', href: '', cta: '' });
    expect(signalNote([mk(1), mk(2)], tr).urgent).toBe(true);
    expect(signalNote([mk(2)], tr)).toMatchObject({ urgent: false, text: expect.stringContaining('sec.signal.today') });
    expect(signalNote([mk(3)], tr).text).toBe('sec.signal.clear');
  });
});

describe('crmPriorities', () => {
  it('puts overdue follow-ups and long-stuck deals in P1', () => {
    const items = crmPriorities(dash({
      focusItems: [
        { kind: 'lead', id: 'l1', label: 'Anna', company: 'Acme', amount: null, days: 9, stage: null, overdue: true },
        { kind: 'deal', id: 'd1', label: 'Big', company: null, amount: 50000, days: 20, stage: 'Proposal', overdue: false },
        { kind: 'deal', id: 'd2', label: 'Small', company: null, amount: 1000, days: 5, stage: 'Discovery', overdue: false },
        { kind: 'invoice', id: 'i1', label: '1', company: null, amount: 5, days: 3, stage: null, overdue: true },
      ],
    }), BASE, tr);
    expect(items.find(i => i.id === 'lead-l1')?.tier).toBe(1);
    expect(items.find(i => i.id === 'deal-d1')?.tier).toBe(1);
    expect(items.find(i => i.id === 'deal-d2')?.tier).toBe(2);
    expect(items.some(i => i.id.startsWith('invoice'))).toBe(false);
  });

  it('asks for a first deal when there are no open deals', () => {
    const items = crmPriorities(dash({ deals: { total: 0, value: 0, won: 0, lost: 0, wonValue: 0, openValue: 0 } }), BASE, tr);
    expect(items.find(i => i.id === 'no-deals')).toMatchObject({ tier: 3, href: `${BASE}/crm/deals?create=true` });
  });

  it('flags new leads as P2 and qualified leads as P3', () => {
    const items = crmPriorities(dash({ leads: { total: 9, new: 4, qualified: 2, contacted: 1, newThisMonth: 4 } }), BASE, tr);
    expect(items.find(i => i.id === 'new-leads')?.tier).toBe(2);
    expect(items.find(i => i.id === 'qualified')?.tier).toBe(3);
  });
});

describe('marketingPriorities', () => {
  const camp = (over: Partial<MetaCampaignSummary>): MetaCampaignSummary => ({
    id: 'c1', metaCampaignId: 'm1', name: 'Camp', status: 'ACTIVE', effectiveStatus: 'ACTIVE', objective: null,
    spend: 100, impressions: 1000, clicks: 20, ctr: 2, cpc: 5, conversions: 0, trend: 'flat', ...over,
  });

  it('flags active spend without conversions as P1', () => {
    const items = marketingPriorities(dash(), [camp({})], BASE, fmt, tr);
    expect(items.find(i => i.id === 'noconv-c1')?.tier).toBe(1);
  });

  it('flags a declining campaign that still converts as P2', () => {
    const items = marketingPriorities(dash(), [camp({ conversions: 3, trend: 'down' })], BASE, fmt, tr);
    expect(items.find(i => i.id === 'down-c1')?.tier).toBe(2);
  });

  it('suggests starting a campaign when none is active', () => {
    const items = marketingPriorities(dash(), [camp({ status: 'PAUSED', effectiveStatus: 'PAUSED' })], BASE, fmt, tr);
    expect(items.find(i => i.id === 'no-campaigns')?.tier).toBe(3);
  });
});

describe('financePriorities', () => {
  const NOW = new Date(2026, 9, 24, 12, 0, 0);
  const inv = (over: Partial<InvoiceWithCustomer>): InvoiceWithCustomer => ({
    id: 'i', invoice_number: '100', amount: 1000, status: 'sent', due_date: '2026-10-20', customers: { name: 'Kunde' },
    ...over,
  } as InvoiceWithCustomer);

  it('treats sent invoices past due as overdue and ranks the longest/largest first', () => {
    const items = financePriorities([
      inv({ id: 'a', invoice_number: '1', due_date: '2026-10-20', amount: 500 }),
      inv({ id: 'b', invoice_number: '2', due_date: '2026-09-01', amount: 500 }),
    ], BASE, fmt, tr, NOW);
    const p1 = itemsInTier(items, 1);
    expect(p1.map(i => i.id)).toEqual(['od-b', 'od-a']);
  });

  it('puts invoices due within 7 days in P2 and drafts in P3', () => {
    const items = financePriorities([
      inv({ id: 'soon', due_date: '2026-10-27' }),
      inv({ id: 'today', due_date: '2026-10-24' }),
      inv({ id: 'later', due_date: '2026-11-30' }),
      inv({ id: 'd', status: 'draft', due_date: null, amount: 250 }),
    ], BASE, fmt, tr, NOW);
    expect(items.find(i => i.id === 'due-soon')?.tier).toBe(2);
    expect(items.find(i => i.id === 'due-today')?.tier).toBe(2);
    expect(items.some(i => i.id === 'due-later')).toBe(false);
    expect(items.find(i => i.id === 'drafts')?.tier).toBe(3);
  });

  it('never calls paid or cancelled invoices overdue', () => {
    expect(isOverdue({ status: 'paid', due_date: '2020-01-01' }, NOW)).toBe(false);
    expect(isOverdue({ status: 'cancelled', due_date: '2020-01-01' }, NOW)).toBe(false);
    expect(isOverdue({ status: 'overdue', due_date: null }, NOW)).toBe(true);
  });

  it('asks for the first invoice when there are none', () => {
    expect(financePriorities([], BASE, fmt, tr, NOW)[0]).toMatchObject({ id: 'first', tier: 3 });
  });

  it('buckets overdue invoices by age', () => {
    const b = agingBuckets([
      inv({ id: '1', due_date: '2026-10-22', amount: 100 }),
      inv({ id: '2', due_date: '2026-10-01', amount: 200 }),
      inv({ id: '3', due_date: '2026-08-01', amount: 400 }),
      inv({ id: '4', due_date: '2026-11-01', amount: 999 }),
    ], NOW);
    expect(b.map(x => [x.key, x.count, x.value])).toEqual([['d7', 1, 100], ['d30', 1, 200], ['d30plus', 1, 400]]);
  });
});

describe('hrPriorities', () => {
  const base = { activeNow: 3, missingCheckout: 0, pendingLeave: 0, employeesActive: 5, employeesTotal: 5, tasksPending: 0 };

  it('knows working hours', () => {
    expect(isWorkingHours(new Date(2026, 9, 21, 10))).toBe(true); // Wednesday
    expect(isWorkingHours(new Date(2026, 9, 24, 10))).toBe(false); // Saturday
    expect(isWorkingHours(new Date(2026, 9, 21, 18))).toBe(false);
  });

  it('orders missing check-outs (P1) before pending leave (P2)', () => {
    const items = hrPriorities({ ...base, missingCheckout: 2, pendingLeave: 3 }, BASE, tr, new Date(2026, 9, 21, 10));
    expect(items.find(i => i.id === 'missing-out')?.tier).toBe(1);
    expect(items.find(i => i.id === 'leave')?.tier).toBe(2);
  });

  it('only warns that nobody is in during working hours', () => {
    const weekday = hrPriorities({ ...base, activeNow: 0 }, BASE, tr, new Date(2026, 9, 21, 10));
    const weekend = hrPriorities({ ...base, activeNow: 0 }, BASE, tr, new Date(2026, 9, 24, 10));
    expect(weekday.some(i => i.id === 'nobody')).toBe(true);
    expect(weekend.some(i => i.id === 'nobody')).toBe(false);
  });
});

describe('controlPriorities', () => {
  const integ = (over: Partial<Integration>): Integration => ({
    id: 'x', company_id: 'c', provider: 'gmail', status: 'connected', account_label: null, scopes: [], metadata: {}, connected_at: null, last_sync_at: null, ...over,
  });
  const action = (over: Partial<AutopilotAction>): AutopilotAction => ({
    id: 'a', company_id: 'c', user_id: 'u', action_id: 'aa', action_type: 't', category: 'c', headline: 'Do it', status: 'proposed',
    rationale: null, payload: null, result: null, triggered_by_event: null, suggested_by: null, created_at: '2026-10-24T10:00:00Z', executed_at: null, ...over,
  });

  it('puts broken integrations in P1 and pending proposals in P2', () => {
    const items = controlPriorities([integ({ status: 'error' }), integ({ id: 'y', status: 'connected' })], [action({}), action({ id: 'b', status: 'executed' })], BASE, tr);
    expect(items.find(i => i.id === 'err-x')?.tier).toBe(1);
    expect(items.filter(i => i.tier === 2)).toHaveLength(1);
  });

  it('nudges to connect an app when none is connected', () => {
    const items = controlPriorities([], [], BASE, tr);
    expect(items.find(i => i.id === 'none')?.tier).toBe(3);
  });
});
