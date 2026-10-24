import type { DashboardSummary } from '@/hooks/api/useDashboard';
import type { PriorityItem, Tr } from './types';

export function crmPriorities(d: DashboardSummary, base: string, tr: Tr): PriorityItem[] {
  const items: PriorityItem[] = [];
  const leadsHref = `${base}/crm/leads`;
  const dealsHref = `${base}/crm/deals?view=board`;

  for (const f of d.focusItems ?? []) {
    if (f.kind === 'invoice') continue;
    if (f.kind === 'deal') {
      const stuckLong = f.days >= 14;
      items.push({
        id: `deal-${f.id}`, tier: stuckLong ? 1 : 2, score: f.days * 10 + (f.amount ?? 0) / 1000,
        title: tr('sec.crm.dealStuck', { name: f.label, stage: f.stage ?? '', n: f.days }),
        detail: f.company ?? (f.amount ? String(Math.round(f.amount)) : ''),
        href: dealsHref, cta: tr('sec.cta.followUp'),
      });
      continue;
    }
    const who = f.company ? `${f.label} · ${f.company}` : f.label;
    items.push({
      id: `${f.kind}-${f.id}`, tier: f.overdue ? 1 : 2, score: (f.overdue ? 500 : 0) + f.days * 10 + (f.amount ?? 0) / 1000,
      title: f.overdue ? tr('sec.crm.followUpOverdue', { who }) : tr('sec.crm.followUpToday', { who }),
      detail: tr('sec.crm.daysNoContact', { n: f.days }),
      href: leadsHref, cta: tr('sec.cta.call'),
    });
  }

  for (const stage of d.pipeline?.stages ?? []) {
    if ((stage.stalled ?? 0) > 0 && !['won', 'lost'].includes(stage.name.toLowerCase())) {
      items.push({
        id: `stalled-${stage.name}`, tier: 2, score: stage.stalled * 10 + (stage.value ?? 0) / 1000,
        title: tr('sec.crm.stalledStage', { n: stage.stalled, stage: stage.name }),
        detail: tr('sec.crm.stalledDetail'), href: dealsHref, cta: tr('sec.cta.openPipeline'),
      });
    }
  }

  const newLeads = d.leads?.new ?? 0;
  if (newLeads > 0) {
    items.push({ id: 'new-leads', tier: 2, score: newLeads, title: tr('sec.crm.newLeads', { n: newLeads }), detail: tr('sec.crm.newLeadsDetail'), href: leadsHref, cta: tr('sec.cta.openLeads') });
  }

  const qualified = d.leads?.qualified ?? 0;
  if (qualified > 0) {
    items.push({ id: 'qualified', tier: 3, score: qualified, title: tr('sec.crm.qualified', { n: qualified }), detail: tr('sec.crm.qualifiedDetail'), href: leadsHref, cta: tr('sec.cta.openLeads') });
  }

  const openDeals = (d.deals?.total ?? 0) - (d.deals?.won ?? 0) - (d.deals?.lost ?? 0);
  if (openDeals === 0) {
    items.push({ id: 'no-deals', tier: 3, score: 1, title: tr('sec.crm.noDeals'), detail: tr('sec.crm.noDealsDetail'), href: `${base}/crm/deals?create=true`, cta: tr('sec.cta.createDeal') });
  }
  if ((d.leads?.newThisMonth ?? 0) === 0) {
    items.push({ id: 'no-new-leads', tier: 3, score: 0, title: tr('sec.crm.noNewLeads'), detail: tr('sec.crm.noNewLeadsDetail'), href: `${base}/crm/lead-generation`, cta: tr('sec.cta.findLeads') });
  }
  return items;
}
