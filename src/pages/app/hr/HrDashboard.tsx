import { useMemo } from 'react';
import { CalendarCheck, CalendarDays, Clock3, Plane, UserCheck, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';
import { useDashboard } from '@/hooks/api/useDashboard';
import { useWorkforceLive } from '@/hooks/api/useWorkforce';
import { usePendingLeaveCount, useUpcomingLeave } from '@/hooks/api/useSectionStats';
import { hrPriorities } from '@/lib/priorities/hr';
import { signalNote } from '@/lib/priorities/types';
import { useTr } from '@/lib/priorities/useTr';
import { CockpitHero, CockpitPage, CompactNumber, ListPanel, Panel, PanelHeader, PriorityBoard, PulseMetric, PulseRow, useAppBase } from '@/components/dashboard/cockpit';

export default function HrDashboard() {
  const tr = useTr();
  const { locale } = useI18n();
  const base = useAppBase();
  const { profile } = useAuth();
  const { data: d, isLoading: dashLoading } = useDashboard();
  const { data: live, isLoading: liveLoading } = useWorkforceLive();
  const { data: pendingLeave = 0, isLoading: leaveLoading } = usePendingLeaveCount();
  const { data: upcoming = [], isLoading: upcomingLoading } = useUpcomingLeave();
  const isLoading = dashLoading || liveLoading || leaveLoading;
  const tag = locale === 'da' ? 'da-DK' : locale === 'de' ? 'de-DE' : 'en-GB';

  const activeNow = live?.activeNow ?? [];
  const priorities = useMemo(() => hrPriorities({
    activeNow: activeNow.length,
    missingCheckout: live?.missingCheckout?.length ?? 0,
    pendingLeave,
    employeesActive: d?.employees?.active ?? 0,
    employeesTotal: d?.employees?.total ?? 0,
    tasksPending: d?.tasks?.pending ?? 0,
  }, base, tr), [activeNow.length, live?.missingCheckout?.length, pendingLeave, d?.employees?.active, d?.employees?.total, d?.tasks?.pending, base, tr]);
  const note = signalNote(priorities, tr);
  const firstName = (profile?.full_name || '').split(' ')[0];
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(tag, { day: 'numeric', month: 'short' });

  return (
    <CockpitPage>
      <CockpitHero
        crumb={tr('nav.hr')}
        eyebrow={tr('sec.hr.eyebrow')}
        lead={tr('sec.hr.lead')}
        accent={tr('sec.hr.accent')}
        intro={tr(firstName ? 'sec.hr.introNamed' : 'sec.hr.intro', { name: firstName })}
        primary={{ label: tr('sec.cta.openAttendance'), href: `${base}/hr/attendance` }}
        actions={[
          { icon: Users, label: tr('nav.employees'), href: `${base}/hr/employees` },
          { icon: Plane, label: tr('nav.leave'), href: `${base}/hr/leave` },
          { icon: Clock3, label: tr('nav.timeTracking'), href: `${base}/hr/time-tracking` },
        ]}
        signal={{
          eyebrow: tr('sec.signalEyebrow'),
          title: tr('sec.hr.signalTitle'),
          items: [
            { label: tr('sec.lbl.clockedIn'), value: activeNow.length, loading: isLoading },
            { label: tr('sec.lbl.team'), value: d?.employees?.active ?? 0, loading: isLoading },
            { label: tr('sec.lbl.pendingLeave'), value: pendingLeave, loading: isLoading },
            { label: tr('sec.lbl.tasks'), value: d?.tasks?.pending ?? 0, loading: isLoading },
          ],
          note: note.text,
          urgent: note.urgent,
          statusLabel: tr(note.urgent ? 'sec.statusAction' : 'sec.statusOk'),
        }}
      />

      <PriorityBoard items={priorities} loading={isLoading} />

      <PulseRow>
        <PulseMetric label={tr('sec.hr.pulseNow')} value={liveLoading ? null : String(activeNow.length)} detail={tr('sec.hr.pulseNowDetail', { n: d?.employees?.active ?? 0 })} href={`${base}/hr/attendance`} icon={UserCheck} tone="blue" />
        <PulseMetric label={tr('sec.hr.pulseHours')} value={liveLoading ? null : String(live?.totalHoursToday ?? 0)} detail={tr('sec.hr.pulseHoursDetail', { n: live?.totalEntriesToday ?? 0 })} href={`${base}/hr/time-tracking`} icon={Clock3} tone="cyan" />
        <PulseMetric label={tr('sec.hr.pulseLeave')} value={leaveLoading ? null : String(pendingLeave)} detail={tr('sec.hr.pulseLeaveDetail')} href={`${base}/hr/leave`} icon={CalendarDays} tone={pendingLeave > 0 ? 'violet' : 'blue'} />
        <PulseMetric label={tr('sec.hr.pulseTeam')} value={dashLoading ? null : String(d?.employees?.total ?? 0)} detail={tr('sec.hr.pulseTeamDetail', { n: d?.employees?.active ?? 0 })} href={`${base}/hr/employees`} icon={Users} tone="violet" />
      </PulseRow>

      <section className="grid gap-6 xl:grid-cols-3">
        <ListPanel
          icon={UserCheck}
          eyebrow={tr('sec.hr.panelNowEyebrow')}
          title={tr('sec.hr.panelNow')}
          emptyText={tr('sec.hr.noOneIn')}
          href={`${base}/hr/attendance`}
          linkLabel={tr('sec.all')}
          isLoading={liveLoading}
          items={activeNow.map(l => ({ id: l.id, primary: l.employee_profiles?.full_name ?? '—', secondary: new Date(l.check_in).toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' }), tone: 'ok' as const }))}
        />
        <ListPanel
          icon={CalendarCheck}
          eyebrow={tr('sec.hr.panelLeaveEyebrow')}
          title={tr('sec.hr.panelLeave')}
          emptyText={tr('sec.hr.noLeave')}
          href={`${base}/hr/leave`}
          linkLabel={tr('sec.all')}
          isLoading={upcomingLoading}
          items={upcoming.map(l => ({ id: l.id, primary: l.name, secondary: `${fmtDate(l.start_date)} – ${fmtDate(l.end_date)}`, tone: l.status === 'pending' ? 'risk' as const : 'muted' as const, href: `${base}/hr/leave` }))}
        />
        <Panel dark>
          <PanelHeader dark eyebrow={tr('sec.hr.panelTeamEyebrow')} title={tr('sec.hr.panelTeam')} action={tr('sec.open')} href={`${base}/hr/workforce`} />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <CompactNumber icon={Users} label={tr('sec.lbl.team')} value={d?.employees?.active ?? 0} loading={dashLoading} />
            <CompactNumber icon={UserCheck} label={tr('sec.lbl.total')} value={d?.employees?.total ?? 0} loading={dashLoading} />
            <CompactNumber icon={Clock3} label={tr('sec.lbl.hoursToday')} value={live?.totalHoursToday ?? 0} loading={liveLoading} />
            <CompactNumber icon={Plane} label={tr('sec.lbl.pendingLeave')} value={pendingLeave} loading={leaveLoading} tone={pendingLeave > 0 ? 'risk' : undefined} />
          </div>
        </Panel>
      </section>
    </CockpitPage>
  );
}
