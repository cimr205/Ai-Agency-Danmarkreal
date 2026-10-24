import { useMemo } from 'react';
import { AlertTriangle, CreditCard, FileText, Receipt, Wallet, CheckCircle2 } from 'lucide-react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip as RTooltip, XAxis } from 'recharts';
import { useAuth } from '@/hooks/useAuth';
import { useDashboard } from '@/hooks/api/useDashboard';
import { useInvoices, usePayments } from '@/hooks/api/useFinance';
import { useCurrency } from '@/contexts/CurrencyContext';
import { agingBuckets, financePriorities, isOverdue } from '@/lib/priorities/finance';
import { signalNote } from '@/lib/priorities/types';
import { useTr } from '@/lib/priorities/useTr';
import { CockpitHero, CockpitPage, EmptyLane, ListPanel, MicroStack, Panel, PanelHeader, PriorityBoard, PulseMetric, PulseRow, BarRows, useAppBase } from '@/components/dashboard/cockpit';

const AURORA = ['#5b7cfa', '#9b7cff', '#20d6ff', '#f59fe8'];

export default function FinanceDashboard() {
  const tr = useTr();
  const base = useAppBase();
  const { format } = useCurrency();
  const { profile } = useAuth();
  const { data: d, isLoading: dashLoading } = useDashboard();
  const { data: invoices = [], isLoading: invLoading } = useInvoices();
  const { data: payments = [], isLoading: payLoading } = usePayments();
  const isLoading = dashLoading || invLoading;
  const now = useMemo(() => new Date(), []);

  const priorities = useMemo(() => financePriorities(invoices, base, format, tr, now), [invoices, base, format, tr, now]);
  const note = signalNote(priorities, tr);
  const buckets = useMemo(() => agingBuckets(invoices, now), [invoices, now]);
  const firstName = (profile?.full_name || '').split(' ')[0];

  const overdue = invoices.filter(i => isOverdue(i, now));
  const overdueValue = overdue.reduce((s, i) => s + i.amount, 0);
  const outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + i.amount, 0);
  const paidCount = invoices.filter(i => i.status === 'paid').length;
  const monthValue = d?.invoices?.monthValue ?? 0;
  const lastMonthValue = d?.invoices?.lastMonthValue ?? 0;
  const delta = lastMonthValue > 0 ? Math.round(((monthValue - lastMonthValue) / lastMonthValue) * 100) : null;
  const revenue = d?.revenueByDay ?? [];

  return (
    <CockpitPage>
      <CockpitHero
        crumb={tr('nav.finance')}
        eyebrow={tr('sec.fin.eyebrow')}
        lead={tr('sec.fin.lead')}
        accent={tr('sec.fin.accent')}
        intro={tr(firstName ? 'sec.fin.introNamed' : 'sec.fin.intro', { name: firstName })}
        primary={{ label: tr('sec.cta.createInvoice'), href: `${base}/finance/invoices?create=true` }}
        actions={[
          { icon: FileText, label: tr('nav.quotes'), href: `${base}/finance/quotes` },
          { icon: CreditCard, label: tr('nav.payments'), href: `${base}/finance/payments` },
          { icon: Receipt, label: tr('nav.invoices'), href: `${base}/finance/invoices` },
        ]}
        signal={{
          eyebrow: tr('sec.signalEyebrow'),
          title: tr('sec.fin.signalTitle'),
          items: [
            { label: tr('sec.lbl.overdue'), value: overdue.length, loading: isLoading },
            { label: tr('sec.lbl.open'), value: invoices.filter(i => i.status === 'sent').length, loading: isLoading },
            { label: tr('sec.lbl.drafts'), value: invoices.filter(i => i.status === 'draft').length, loading: isLoading },
            { label: tr('sec.lbl.paid'), value: paidCount, loading: isLoading },
          ],
          note: note.text,
          urgent: note.urgent,
          statusLabel: tr(note.urgent ? 'sec.statusAction' : 'sec.statusOk'),
        }}
      />

      <PriorityBoard items={priorities} loading={isLoading} />

      <PulseRow>
        <PulseMetric label={tr('sec.fin.pulseMonth')} value={isLoading ? null : format(monthValue)} detail={delta === null ? tr('sec.fin.firstMonth') : tr(delta >= 0 ? 'sec.fin.vsLastUp' : 'sec.fin.vsLastDown', { n: Math.abs(delta) })} href={`${base}/finance/invoices`} icon={Wallet} tone={delta !== null && delta < 0 ? 'risk' : 'blue'} />
        <PulseMetric label={tr('sec.fin.pulseOutstanding')} value={isLoading ? null : format(outstanding)} detail={tr('sec.fin.pulseOutstandingDetail')} href={`${base}/finance/invoices`} icon={Receipt} tone="violet" />
        <PulseMetric label={tr('sec.fin.pulseOverdue')} value={isLoading ? null : format(overdueValue)} detail={tr('sec.fin.pulseOverdueDetail', { n: overdue.length })} href={`${base}/finance/invoices`} icon={AlertTriangle} tone={overdueValue > 0 ? 'risk' : 'cyan'} />
        <PulseMetric label={tr('sec.fin.pulsePaid')} value={isLoading ? null : String(paidCount)} detail={tr('sec.fin.pulsePaidDetail', { n: invoices.length })} href={`${base}/finance/payments`} icon={CheckCircle2} tone="cyan" />
      </PulseRow>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader eyebrow={tr('sec.fin.panelRevEyebrow')} title={tr('sec.fin.panelRev')} action={tr('sec.cta.openInvoices')} href={`${base}/finance/invoices`} />
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_240px]">
            <div className="min-h-[280px] rounded-[1.6rem] border border-white/70 bg-gradient-to-br from-slate-950 to-[#162554] p-4 text-white">
              {revenue.length > 0 ? (
                <ResponsiveContainer width="100%" height={255}>
                  <BarChart data={revenue} barCategoryGap="28%">
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.48)', fontSize: 11 }} />
                    <RTooltip cursor={{ fill: 'rgba(255,255,255,0.06)' }} contentStyle={{ background: 'rgba(15,23,42,0.94)', border: '1px solid rgba(255,255,255,0.16)', borderRadius: 18, color: '#fff', fontSize: 12 }} formatter={(v: number) => [format(v), tr('sec.fin.revenue')]} />
                    <Bar dataKey="value" radius={[12, 12, 4, 4]} maxBarSize={42}>
                      {revenue.map((e, i) => <Cell key={`${e.label}-${i}`} fill={AURORA[i % AURORA.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyLane dark title={tr('sec.fin.noRevTitle')} text={tr('sec.fin.noRevText')} href={`${base}/finance/invoices?create=true`} action={tr('sec.cta.createInvoice')} />
              )}
            </div>
            <div className="rounded-[1.6rem] border border-white/70 bg-white/72 p-5">
              <MicroStack items={[
                { label: tr('sec.fin.invoiced'), value: format(monthValue) },
                { label: tr('sec.fin.pulseOutstanding'), value: format(outstanding) },
                { label: tr('sec.fin.pulseOverdue'), value: format(overdueValue), tone: overdueValue > 0 ? 'risk' : undefined },
                { label: tr('sec.fin.total'), value: String(invoices.length) },
              ]} />
            </div>
          </div>
        </Panel>

        <div className="grid gap-6">
          <Panel>
            <PanelHeader eyebrow={tr('sec.fin.panelAgingEyebrow')} title={tr('sec.fin.panelAging')} />
            <div className="mt-5 rounded-[1.6rem] border border-white/70 bg-white/70 p-5">
              <BarRows rows={buckets.map(b => ({
                label: tr(`sec.fin.aging.${b.key}`),
                value: b.value,
                display: format(b.value),
                color: b.key === 'd30plus' ? '#f43f5e' : b.key === 'd30' ? '#fb923c' : '#5b7cfa',
                note: tr('sec.fin.agingCount', { n: b.count }),
              }))} />
            </div>
          </Panel>
          <ListPanel
            icon={CreditCard}
            eyebrow={tr('sec.fin.panelPayEyebrow')}
            title={tr('sec.fin.panelPay')}
            emptyText={tr('sec.fin.noPayments')}
            href={`${base}/finance/payments`}
            linkLabel={tr('sec.all')}
            isLoading={payLoading}
            items={payments.slice(0, 6).map(p => ({ id: p.id, primary: p.invoices?.customers?.name ?? p.invoices?.invoice_number ?? '—', secondary: format(p.amount), tone: 'ok' as const, href: `${base}/finance/payments` }))}
          />
        </div>
      </section>
    </CockpitPage>
  );
}
