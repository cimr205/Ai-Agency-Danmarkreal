import type { DashboardSummary } from '@/hooks/api/useDashboard';
import type { MetaCampaignSummary } from '@/hooks/api/useMetaAdsData';
import type { PriorityItem, Tr } from './types';

export function isActiveCampaign(c: MetaCampaignSummary): boolean {
  return (c.effectiveStatus ?? c.status ?? '').toUpperCase() === 'ACTIVE';
}

export function marketingPriorities(
  d: DashboardSummary | undefined,
  campaigns: MetaCampaignSummary[],
  base: string,
  fmt: (n: number) => string,
  tr: Tr,
): PriorityItem[] {
  const items: PriorityItem[] = [];
  const adsHref = `${base}/marketing/meta-ads`;
  const active = campaigns.filter(isActiveCampaign);

  for (const c of active) {
    if (c.spend > 0 && c.conversions === 0) {
      items.push({ id: `noconv-${c.id}`, tier: 1, score: c.spend, title: tr('sec.mkt.noConversions', { name: c.name, spend: fmt(c.spend) }), detail: tr('sec.mkt.noConversionsDetail', { clicks: c.clicks }), href: adsHref, cta: tr('sec.cta.reviewCampaign') });
    } else if (c.trend === 'down') {
      items.push({ id: `down-${c.id}`, tier: 2, score: c.spend, title: tr('sec.mkt.declining', { name: c.name }), detail: tr('sec.mkt.decliningDetail', { ctr: c.ctr.toFixed(1) }), href: adsHref, cta: tr('sec.cta.reviewCampaign') });
    }
  }

  const unread = d?.emails?.unread ?? 0;
  if (unread > 0) items.push({ id: 'unread', tier: 2, score: unread, title: tr('sec.mkt.unread', { n: unread }), detail: tr('sec.mkt.unreadDetail'), href: `${base}/email/emails`, cta: tr('sec.cta.openInbox') });

  const newLeads = d?.leads?.new ?? 0;
  if (newLeads > 0) items.push({ id: 'new-leads', tier: 2, score: newLeads, title: tr('sec.mkt.newLeads', { n: newLeads }), detail: tr('sec.mkt.newLeadsDetail'), href: `${base}/marketing/cold-caller`, cta: tr('sec.cta.startDialer') });

  if (active.length === 0) items.push({ id: 'no-campaigns', tier: 3, score: 2, title: tr('sec.mkt.noCampaigns'), detail: tr('sec.mkt.noCampaignsDetail'), href: adsHref, cta: tr('sec.cta.openMetaAds') });
  if ((d?.leads?.newThisMonth ?? 0) === 0) items.push({ id: 'no-leads-month', tier: 3, score: 1, title: tr('sec.mkt.noLeadsMonth'), detail: tr('sec.mkt.noLeadsMonthDetail'), href: `${base}/ai/media`, cta: tr('sec.cta.createContent') });
  return items;
}
