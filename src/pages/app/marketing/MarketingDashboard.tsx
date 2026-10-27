import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Megaphone, Mic, MousePointerClick, PhoneCall, Send, Sparkles, Target, TrendingDown, TrendingUp, Wallet, Minus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useDashboard } from '@/hooks/api/useDashboard';
import { useMetaCampaigns } from '@/hooks/api/useMetaAdsData';
import { useCurrency } from '@/contexts/CurrencyContext';
import { marketingPriorities, isActiveCampaign } from '@/lib/priorities/marketing';
import { signalNote } from '@/lib/priorities/types';
import { useTr } from '@/lib/priorities/useTr';
import { cn } from '@/lib/utils';
import { CockpitHero, CockpitPage, EmptyLane, Panel, PanelHeader, PriorityBoard, PulseMetric, PulseRow, useAppBase } from '@/components/dashboard/cockpit';

export default function MarketingDashboard() {
  const tr = useTr();
  const base = useAppBase();
  const { format } = useCurrency();
  const { profile } = useAuth();
  const { data: d, isLoading: dashLoading } = useDashboard();
  const { data: campaigns = [], isLoading: campLoading } = useMetaCampaigns();
  const isLoading = dashLoading || campLoading;

  const priorities = useMemo(() => marketingPriorities(d, campaigns, base, format, tr), [d, campaigns, base, format, tr]);
  const note = signalNote(priorities, tr);
  const firstName = (profile?.full_name || '').split(' ')[0];

  const active = campaigns.filter(isActiveCampaign);
  const spend = campaigns.reduce((s, c) => s + c.spend, 0);
  const clicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const impressions = campaigns.reduce((s, c) => s + c.impressions, 0);
  const conversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const top = [...campaigns].sort((a, b) => b.spend - a.spend).slice(0, 6);

  const channels = [
    { icon: PhoneCall, label: tr('nav.coldCaller'), text: tr('sec.mkt.chDialer'), href: `${base}/marketing/cold-caller` },
    { icon: Send, label: tr('nav.bulkEmail'), text: tr('sec.mkt.chEmail'), href: `${base}/email/bulk` },
    { icon: Mic, label: tr('nav.voiceAgent'), text: tr('sec.mkt.chVoice'), href: `${base}/marketing/voice-agent` },
    { icon: Sparkles, label: tr('nav.studio'), text: tr('sec.mkt.chMedia'), href: `${base}/marketing/studio` },
  ];

  return (
    <CockpitPage>
      <CockpitHero
        crumb={tr('nav.marketing')}
        eyebrow={tr('sec.mkt.eyebrow')}
        lead={tr('sec.mkt.lead')}
        accent={tr('sec.mkt.accent')}
        intro={tr(firstName ? 'sec.mkt.introNamed' : 'sec.mkt.intro', { name: firstName })}
        primary={{ label: tr('sec.mkt.primary'), href: `${base}/marketing/cold-caller` }}
        actions={[
          { icon: Megaphone, label: tr('nav.metaAds'), href: `${base}/marketing/meta-ads` },
          { icon: Send, label: tr('nav.bulkEmail'), href: `${base}/email/bulk` },
          { icon: Sparkles, label: tr('nav.studio'), href: `${base}/marketing/studio` },
        ]}
        signal={{
          eyebrow: tr('sec.signalEyebrow'),
          title: tr('sec.mkt.signalTitle'),
          items: [
            { label: tr('sec.lbl.activeCampaigns'), value: active.length, loading: isLoading },
            { label: tr('sec.lbl.newLeads'), value: d?.leads?.new ?? 0, loading: isLoading },
            { label: tr('sec.lbl.unread'), value: d?.emails?.unread ?? 0, loading: isLoading },
            { label: tr('sec.lbl.conversions'), value: conversions, loading: isLoading },
          ],
          note: note.text,
          urgent: note.urgent,
          statusLabel: tr(note.urgent ? 'sec.statusAction' : 'sec.statusOk'),
        }}
      />

      <PriorityBoard items={priorities} loading={isLoading} />

      <PulseRow>
        <PulseMetric label={tr('sec.mkt.pulseSpend')} value={campLoading ? null : format(spend)} detail={tr('sec.mkt.pulseSpendDetail')} href={`${base}/marketing/meta-ads`} icon={Wallet} tone="violet" />
        <PulseMetric label={tr('sec.mkt.pulseClicks')} value={campLoading ? null : String(clicks)} detail={tr('sec.mkt.pulseClicksDetail', { n: impressions })} href={`${base}/marketing/meta-ads`} icon={MousePointerClick} tone="blue" />
        <PulseMetric label={tr('sec.mkt.pulseConversions')} value={campLoading ? null : String(conversions)} detail={tr('sec.mkt.pulseConversionsDetail', { cost: conversions > 0 ? format(spend / conversions) : '–' })} href={`${base}/marketing/meta-ads`} icon={Target} tone={spend > 0 && conversions === 0 ? 'risk' : 'cyan'} />
        <PulseMetric label={tr('sec.mkt.pulseCtr')} value={campLoading ? null : `${ctr.toFixed(1)}%`} detail={tr('sec.mkt.pulseCtrDetail', { n: active.length })} href={`${base}/marketing/meta-ads`} icon={TrendingUp} tone="blue" />
      </PulseRow>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader eyebrow={tr('sec.mkt.panelCampEyebrow')} title={tr('sec.mkt.panelCamp')} action={tr('sec.open')} href={`${base}/marketing/meta-ads`} />
          <div className="mt-5 rounded-[1.6rem] border border-white/70 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5 sm:p-4">
            {top.length === 0 ? (
              <EmptyLane title={tr('sec.mkt.noCampTitle')} text={tr('sec.mkt.noCampText')} href={`${base}/marketing/meta-ads`} action={tr('sec.cta.openMetaAds')} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[12.5px]">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-white/40">
                      <th className="px-3 py-2 font-bold">{tr('sec.mkt.colCampaign')}</th>
                      <th className="px-3 py-2 text-right font-bold">{tr('sec.mkt.colSpend')}</th>
                      <th className="px-3 py-2 text-right font-bold">{tr('sec.mkt.colConv')}</th>
                      <th className="px-3 py-2 text-right font-bold">{tr('sec.mkt.colCtr')}</th>
                      <th className="px-3 py-2 text-right font-bold">{tr('sec.mkt.colTrend')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map(c => (
                      <tr key={c.id} className="border-t border-slate-200/60 dark:border-white/10">
                        <td className="max-w-[220px] px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span className={cn('h-2 w-2 shrink-0 rounded-full', isActiveCampaign(c) ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-white/20')} />
                            <span className="truncate font-medium text-slate-900 dark:text-white">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-white/70">{format(c.spend)}</td>
                        <td className={cn('px-3 py-3 text-right tabular-nums', isActiveCampaign(c) && c.spend > 0 && c.conversions === 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-white/70')}>{c.conversions}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-700 dark:text-white/70">{c.ctr.toFixed(1)}%</td>
                        <td className="px-3 py-3 text-right">
                          {c.trend === 'up' ? <TrendingUp className="ml-auto h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : c.trend === 'down' ? <TrendingDown className="ml-auto h-4 w-4 text-rose-600 dark:text-rose-400" /> : <Minus className="ml-auto h-4 w-4 text-slate-400 dark:text-white/40" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader eyebrow={tr('sec.mkt.panelChEyebrow')} title={tr('sec.mkt.panelCh')} />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {channels.map(ch => (
              <Link key={ch.href} to={ch.href} className="group rounded-[1.4rem] border border-white/70 bg-white/70 p-4 transition-all hover:-translate-y-0.5 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-950 text-white dark:bg-white dark:text-slate-950"><ch.icon className="h-4 w-4" /></span>
                <p className="mt-3 text-[14px] font-semibold text-slate-950 dark:text-white">{ch.label}</p>
                <p className="mt-1 text-[12px] leading-5 text-slate-500 dark:text-white/50">{ch.text}</p>
                <p className="mt-3 flex items-center gap-1 text-[12px] font-semibold text-blue-600 dark:text-blue-400">{tr('sec.open')} <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /></p>
              </Link>
            ))}
          </div>
        </Panel>
      </section>
    </CockpitPage>
  );
}
