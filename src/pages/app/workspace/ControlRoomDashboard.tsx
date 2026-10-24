import { useMemo } from 'react';
import { Bot, Lightbulb, Plug, ShieldCheck, AlertTriangle, Workflow, Activity, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { useIntegrations } from '@/hooks/api/useIntegrations';
import { useAutopilotActions, useWorkspaceEvents } from '@/hooks/api/useAutopilot';
import { controlPriorities, isPendingAction } from '@/lib/priorities/control';
import { signalNote } from '@/lib/priorities/types';
import { useTr } from '@/lib/priorities/useTr';
import { CockpitHero, CockpitPage, ListPanel, PriorityBoard, PulseMetric, PulseRow, useAppBase } from '@/components/dashboard/cockpit';

export default function ControlRoomDashboard() {
  const tr = useTr();
  const { locale } = useI18n();
  const base = useAppBase();
  const { profile } = useAuth();
  const { data: integrations = [], isLoading: intLoading } = useIntegrations();
  const { data: actions = [], isLoading: actLoading } = useAutopilotActions();
  const { data: events = [], isLoading: evLoading } = useWorkspaceEvents(30);
  const isLoading = intLoading || actLoading;
  const tag = locale === 'da' ? 'da-DK' : locale === 'de' ? 'de-DE' : 'en-GB';

  const priorities = useMemo(() => controlPriorities(integrations, actions, base, tr), [integrations, actions, base, tr]);
  const note = signalNote(priorities, tr);
  const firstName = (profile?.full_name || '').split(' ')[0];

  const connected = integrations.filter(i => i.status === 'connected').length;
  const errors = integrations.filter(i => i.status === 'error').length;
  const pending = actions.filter(isPendingAction);
  const dayAgo = Date.now() - 86_400_000;
  const recentEvents = events.filter(e => new Date(e.created_at).getTime() >= dayAgo).length;

  const statusKey = (s: string) => `sec.ctl.status.${s}`;

  return (
    <CockpitPage>
      <CockpitHero
        crumb={tr('nav.controlRoom')}
        eyebrow={tr('sec.ctl.eyebrow')}
        lead={tr('sec.ctl.lead')}
        accent={tr('sec.ctl.accent')}
        intro={tr(firstName ? 'sec.ctl.introNamed' : 'sec.ctl.intro', { name: firstName })}
        primary={{ label: tr('sec.cta.reviewAction'), href: `${base}/workspace/operating-manager` }}
        actions={[
          { icon: Workflow, label: tr('nav.studio'), href: `${base}/workspace/studio` },
          { icon: Plug, label: tr('nav.connectedApps'), href: `${base}/workspace/connected-apps` },
          { icon: Bot, label: tr('nav.assistant'), href: `${base}/pa` },
        ]}
        signal={{
          eyebrow: tr('sec.signalEyebrow'),
          title: tr('sec.ctl.signalTitle'),
          items: [
            { label: tr('sec.lbl.connected'), value: connected, loading: intLoading },
            { label: tr('sec.lbl.awaiting'), value: pending.length, loading: actLoading },
            { label: tr('sec.lbl.errors'), value: errors, loading: intLoading },
            { label: tr('sec.lbl.events24'), value: recentEvents, loading: evLoading },
          ],
          note: note.text,
          urgent: note.urgent,
          statusLabel: tr(note.urgent ? 'sec.statusAction' : 'sec.statusOk'),
        }}
      />

      <PriorityBoard items={priorities} loading={isLoading} />

      <PulseRow>
        <PulseMetric label={tr('sec.ctl.pulseApps')} value={intLoading ? null : `${connected}/${integrations.length}`} detail={tr('sec.ctl.pulseAppsDetail')} href={`${base}/workspace/connected-apps`} icon={Plug} tone="blue" />
        <PulseMetric label={tr('sec.ctl.pulseActions')} value={actLoading ? null : String(pending.length)} detail={tr('sec.ctl.pulseActionsDetail')} href={`${base}/workspace/operating-manager`} icon={ShieldCheck} tone={pending.length > 0 ? 'violet' : 'blue'} />
        <PulseMetric label={tr('sec.ctl.pulseErrors')} value={intLoading ? null : String(errors)} detail={tr('sec.ctl.pulseErrorsDetail')} href={`${base}/workspace/connected-apps`} icon={AlertTriangle} tone={errors > 0 ? 'risk' : 'cyan'} />
        <PulseMetric label={tr('sec.ctl.pulseEvents')} value={evLoading ? null : String(recentEvents)} detail={tr('sec.ctl.pulseEventsDetail')} href={`${base}/workspace/intelligence`} icon={Activity} tone="cyan" />
      </PulseRow>

      <section className="grid gap-6 xl:grid-cols-3">
        <ListPanel
          icon={Plug}
          eyebrow={tr('sec.ctl.panelAppsEyebrow')}
          title={tr('sec.ctl.panelApps')}
          emptyText={tr('sec.ctl.noApps')}
          href={`${base}/workspace/connected-apps`}
          linkLabel={tr('sec.all')}
          isLoading={intLoading}
          items={integrations.map(i => ({ id: i.id, primary: i.account_label ? `${i.provider} · ${i.account_label}` : i.provider, secondary: tr(statusKey(i.status)), tone: i.status === 'error' ? 'risk' as const : i.status === 'connected' ? 'ok' as const : 'muted' as const, href: `${base}/workspace/connected-apps` }))}
        />
        <ListPanel
          icon={Zap}
          eyebrow={tr('sec.ctl.panelActionsEyebrow')}
          title={tr('sec.ctl.panelActions')}
          emptyText={tr('sec.ctl.noActions')}
          href={`${base}/workspace/operating-manager`}
          linkLabel={tr('sec.all')}
          isLoading={actLoading}
          items={pending.map(a => ({ id: a.id, primary: a.headline, secondary: new Date(a.created_at).toLocaleDateString(tag, { day: 'numeric', month: 'short' }), href: `${base}/workspace/operating-manager` }))}
        />
        <ListPanel
          icon={Lightbulb}
          eyebrow={tr('sec.ctl.panelEventsEyebrow')}
          title={tr('sec.ctl.panelEvents')}
          emptyText={tr('sec.ctl.noEvents')}
          href={`${base}/workspace/intelligence`}
          linkLabel={tr('sec.all')}
          isLoading={evLoading}
          items={events.slice(0, 6).map(e => ({ id: e.id, primary: e.type, secondary: new Date(e.created_at).toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' }), tone: 'muted' as const }))}
        />
      </section>
    </CockpitPage>
  );
}
