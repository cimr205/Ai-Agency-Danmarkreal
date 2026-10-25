import { useMemo } from 'react';
import { Briefcase, Filter, PhoneCall, Target, Trophy, Users } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';
import { useAuth } from '@/hooks/useAuth';
import { useDashboard } from '@/hooks/api/useDashboard';
import { useCurrency } from '@/contexts/CurrencyContext';
import { crmPriorities } from '@/lib/priorities/crm';
import { signalNote } from '@/lib/priorities/types';
import { useTr } from '@/lib/priorities/useTr';
import {
  BarRows, CockpitHero, CockpitPage, EmptyLane, ListPanel, Panel, PanelHeader, PriorityBoard, PulseMetric, PulseRow, useAppBase,
} from '@/components/dashboard/cockpit';

const COLORS = ['#5b7cfa', '#9b7cff', '#20d6ff', '#f59fe8'];

export default function CrmDashboard() {
  const tr = useTr();
  const base = useAppBase();
  const { format } = useCurrency();
  const { profile } = useAuth();
  const { data: d, isLoading } = useDashboard();

  const priorities = useMemo(() => (d ? crmPriorities(d, base, tr) : []), [d, base, tr]);
  const note = signalNote(priorities, tr);
  const firstName = (profile?.full_name || '').split(' ')[0];

  const openDeals = (d?.deals?.total ?? 0) - (d?.deals?.won ?? 0) - (d?.deals?.lost ?? 0);
  const stages = (d?.pipeline?.stages ?? []).filter(s => s.count > 0);
  const followUps = d?.followUps ?? [];

  return (
    <CockpitPage>
      <CockpitHero
        crumb={tr('nav.crm')}
        eyebrow={tr('sec.crm.eyebrow')}
        lead={tr('sec.crm.lead')}
        accent={tr('sec.crm.accent')}
        intro={tr(firstName ? 'sec.crm.introNamed' : 'sec.crm.intro', { name: firstName })}
        primary={{ label: tr('sec.crm.newLead'), href: `${base}/crm/leads?create=true` }}
        actions={[
          { icon: Briefcase, label: tr('sec.crm.newDeal'), href: `${base}/crm/deals?create=true` },
          { icon: Filter, label: tr('nav.leadGeneration'), href: `${base}/crm/lead-generation` },
          { icon: Target, label: tr('nav.icp'), href: `${base}/crm/icp` },
        ]}
        signal={{
          eyebrow: tr('sec.signalEyebrow'),
          title: tr('sec.crm.signalTitle'),
          items: [
            { label: tr('sec.lbl.newLeads'), value: d?.leads?.new ?? 0, loading: isLoading },
            { label: tr('sec.lbl.openDeals'), value: openDeals, loading: isLoading },
            { label: tr('sec.lbl.followUps'), value: followUps.length, loading: isLoading },
            { label: tr('sec.lbl.qualified'), value: d?.leads?.qualified ?? 0, loading: isLoading },
          ],
          note: note.text,
          urgent: note.urgent,
          statusLabel: tr(note.urgent ? 'sec.statusAction' : 'sec.statusOk'),
        }}
      />

      <PriorityBoard items={priorities} loading={isLoading} />

      <PulseRow>
        <PulseMetric label={tr('sec.crm.pulseLeads')} value={isLoading ? null : String(d?.leads?.newThisMonth ?? 0)} detail={tr('sec.crm.pulseLeadsDetail', { n: d?.leads?.total ?? 0 })} href={`${base}/crm/leads`} icon={Users} tone="blue" />
        <PulseMetric label={tr('sec.crm.pulsePipeline')} value={isLoading ? null : format(d?.deals?.openValue ?? 0)} detail={tr('sec.crm.pulsePipelineDetail', { n: openDeals })} href={`${base}/crm/deals?view=board`} icon={Briefcase} tone="violet" />
        <PulseMetric label={tr('sec.crm.pulseWon')} value={isLoading ? null : format(d?.deals?.wonValue ?? 0)} detail={tr('sec.crm.pulseWonDetail', { n: d?.deals?.won ?? 0 })} href={`${base}/crm/deals`} icon={Trophy} tone="cyan" />
        <PulseMetric label={tr('sec.crm.pulseFollowUps')} value={isLoading ? null : String(followUps.filter(f => f.overdue).length)} detail={tr('sec.crm.pulseFollowUpsDetail', { n: followUps.length })} href={`${base}/crm/leads`} icon={PhoneCall} tone={followUps.some(f => f.overdue) ? 'risk' : 'blue'} />
      </PulseRow>

      <section className="grid gap-6 xl:grid-cols-3">
        <Panel>
          <PanelHeader eyebrow={tr('sec.crm.panelPipelineEyebrow')} title={tr('sec.crm.panelPipeline')} action={tr('sec.open')} href={`${base}/crm/deals?view=board`} />
          <div className="mt-5 rounded-[1.6rem] border border-white/70 bg-white/70 p-5 dark:border-white/10 dark:bg-white/5">
            {stages.length > 0 ? (
              <div className="grid grid-cols-[110px_1fr] gap-4">
                <div className="h-[110px] w-[110px] rounded-full bg-slate-950/5 p-2 dark:bg-white/5">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stages} dataKey="count" nameKey="name" innerRadius={32} outerRadius={50} paddingAngle={3} stroke="none">
                        {stages.map((s, i) => <Cell key={s.name} fill={s.color || COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <RTooltip contentStyle={{ background: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))', border: '1px solid rgba(148,163,184,0.3)', borderRadius: 16, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="self-center">
                  <BarRows rows={stages.map((s, i) => ({ label: s.name, value: s.count, display: String(s.count), color: s.color || COLORS[i % COLORS.length], note: s.stalled > 0 ? tr('sec.crm.stalledNote', { n: s.stalled }) : format(s.value ?? 0), noteTone: s.stalled > 0 ? 'risk' : undefined }))} />
                </div>
              </div>
            ) : (
              <EmptyLane title={tr('sec.crm.noPipelineTitle')} text={tr('sec.crm.noPipelineText')} href={`${base}/crm/deals?create=true`} action={tr('sec.cta.createDeal')} />
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader eyebrow={tr('sec.crm.panelFunnelEyebrow')} title={tr('sec.crm.panelFunnel')} action={tr('sec.open')} href={`${base}/crm/leads`} />
          <div className="mt-5 rounded-[1.6rem] border border-white/70 bg-white/70 p-5 dark:border-white/10 dark:bg-white/5">
            <BarRows rows={[
              { label: tr('sec.lbl.newLeads'), value: d?.leads?.new ?? 0, display: String(d?.leads?.new ?? 0), color: COLORS[0] },
              { label: tr('sec.lbl.contacted'), value: d?.leads?.contacted ?? 0, display: String(d?.leads?.contacted ?? 0), color: COLORS[1] },
              { label: tr('sec.lbl.qualified'), value: d?.leads?.qualified ?? 0, display: String(d?.leads?.qualified ?? 0), color: COLORS[2] },
            ]} />
          </div>
        </Panel>

        <ListPanel
          icon={PhoneCall}
          eyebrow={tr('sec.crm.panelFollowEyebrow')}
          title={tr('sec.crm.panelFollow')}
          emptyText={tr('sec.crm.noFollowUps')}
          href={`${base}/crm/leads`}
          linkLabel={tr('sec.all')}
          isLoading={isLoading}
          items={followUps.map(f => ({ id: f.id, primary: f.company_name ? `${f.name} · ${f.company_name}` : f.name, secondary: tr('sec.daysShort', { n: f.days_since_contact }), tone: f.overdue ? 'risk' : undefined, href: `${base}/crm/leads` }))}
        />
      </section>
    </CockpitPage>
  );
}
