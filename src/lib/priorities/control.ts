import type { Integration } from '@/hooks/api/useIntegrations';
import type { AutopilotAction } from '@/hooks/api/useAutopilot';
import type { PriorityItem, Tr } from './types';

export function isPendingAction(a: Pick<AutopilotAction, 'status'>): boolean {
  return a.status === 'proposed' || a.status === 'pending';
}

export function controlPriorities(integrations: Integration[], actions: AutopilotAction[], base: string, tr: Tr): PriorityItem[] {
  const items: PriorityItem[] = [];
  const appsHref = `${base}/workspace/connected-apps`;

  for (const i of integrations) {
    const name = i.account_label ? `${i.provider} · ${i.account_label}` : i.provider;
    if (i.status === 'error') items.push({ id: `err-${i.id}`, tier: 1, score: 100, title: tr('sec.ctl.integrationError', { name }), detail: tr('sec.ctl.integrationErrorDetail'), href: appsHref, cta: tr('sec.cta.fixConnection') });
    else if (i.status === 'disconnected' || i.status === 'pending') items.push({ id: `dis-${i.id}`, tier: 3, score: 1, title: tr(i.status === 'pending' ? 'sec.ctl.integrationPending' : 'sec.ctl.integrationOff', { name }), detail: tr('sec.ctl.integrationOffDetail'), href: appsHref, cta: tr('sec.cta.openApps') });
  }

  for (const a of actions.filter(isPendingAction).slice(0, 6)) {
    items.push({ id: `act-${a.id}`, tier: 2, score: 50 - items.length, title: a.headline, detail: a.rationale ?? tr('sec.ctl.actionDetail'), href: `${base}/workspace/operating-manager`, cta: tr('sec.cta.reviewAction') });
  }

  if (!integrations.some(i => i.status === 'connected')) items.push({ id: 'none', tier: 3, score: 2, title: tr('sec.ctl.noneConnected'), detail: tr('sec.ctl.noneConnectedDetail'), href: appsHref, cta: tr('sec.cta.openApps') });
  return items;
}
