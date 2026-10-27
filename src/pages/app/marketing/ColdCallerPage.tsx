import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  PhoneCall,
  PhoneOff,
  RotateCcw,
  Smartphone,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PhoneDeviceConnection } from '@/components/power-dialer/PhoneDeviceConnection';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import {
  WorkspaceFrame,
  WorkspaceGradientSurface,
  WorkspacePillButton,
  WorkspaceSurface,
} from '@/components/workspace/WorkspacePanel';
import { WorkspaceSidebarPanel } from '@/components/workspace/SidebarPanel';
import { SegmentedControl } from '@/components/workspace/SegmentedControl';
import { WorkspaceTile } from '@/components/workspace/Tile';
import { WorkspaceActiveRow } from '@/components/workspace/ActiveRow';
import { useLeads, type LeadWithOwner } from '@/hooks/api/useLeads';
import {
  useLogPowerDialerCall,
  usePowerDialerCalls,
  type CallOutcome,
} from '@/hooks/api/usePowerDialer';
import { useCreatePhoneCallCommand } from '@/hooks/api/usePhoneDeviceRelay';
import { toast } from '@/hooks/use-toast';
import {
  getDevicePlatform,
  getExpectedHandoffMethod,
  getTelephoneUri,
  tryAndroidNativeDialer,
  type DevicePlatform,
  type DialHandoffMethod,
} from '@/lib/deviceDialer';
import { getErrorMessage } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import { isDialerConnectionReady, loadConnectedPhone, type ConnectedPhone } from '@/lib/phoneDevice';
import { cn } from '@/lib/utils';

const PENDING_CALL_KEY = 'crm-power-dialer-pending-v1';

// TEMP — visual QA only, removed before this change ships. Lets the design
// review take real screenshots without a login/company session, mirroring
// calendar/demoEvents.ts's `?demo=1` convention.
function isScreenshotDemoMode() {
  return import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo');
}
const DEMO_LEADS: LeadWithOwner[] = [
  { id: 'demo-1', name: 'Mette Holm', company_name: 'Holm Rådgivning ApS', email: 'mette@holm.dk', phone: '+45 20 11 22 33', notes: 'Spurgte ind til enterprise-planen sidste uge.' } as LeadWithOwner,
  { id: 'demo-2', name: 'Jakob Lind', company_name: 'Lind Byg A/S', email: 'jakob@lindbyg.dk', phone: '+45 30 44 55 66', notes: null } as LeadWithOwner,
  { id: 'demo-3', name: 'Sara Nissen', company_name: 'Nissen Consulting', email: 'sara@nissen.dk', phone: '+45 22 77 88 99', notes: null } as LeadWithOwner,
];
const DEMO_CALLS = [
  { id: 'c1', lead_id: 'demo-4', phone_number: '+4512340000', outcome: 'no_answer', dialed_at: new Date().toISOString(), callback_at: null, lead: { id: 'demo-4', name: 'Peter Krogh', company_name: 'Krogh ApS', phone: '+4512340000' } },
  { id: 'c2', lead_id: 'demo-5', phone_number: '+4512340001', outcome: 'interested', dialed_at: new Date().toISOString(), callback_at: null, lead: { id: 'demo-5', name: 'Anne Dahl', company_name: 'Dahl Partners', phone: '+4512340001' } },
] as unknown as ReturnType<typeof usePowerDialerCalls>['data'];

type DialerView = 'queue' | 'history' | 'setup';

interface PendingCall {
  version: 1;
  leadId: string;
  startedAt: number;
  platform: DevicePlatform;
  handoffMethod: DialHandoffMethod;
}

const OUTCOMES: Array<{
  value: CallOutcome;
  labelKey: string;
  icon: typeof PhoneOff;
  dotClassName: string;
  selectedClassName: string;
}> = [
  {
    value: 'no_answer',
    labelKey: 'devicePowerDialer.outcomes.noAnswer',
    icon: PhoneOff,
    dotClassName: 'bg-workspace-outcome-none',
    selectedClassName: 'border-workspace-outcome-none bg-workspace-outcome-none/10 text-foreground',
  },
  {
    value: 'callback',
    labelKey: 'devicePowerDialer.outcomes.callback',
    icon: CalendarClock,
    dotClassName: 'bg-workspace-outcome-callback',
    selectedClassName: 'border-workspace-outcome-callback bg-workspace-outcome-callback/10 text-foreground',
  },
  {
    value: 'interested',
    labelKey: 'devicePowerDialer.outcomes.interested',
    icon: ThumbsUp,
    dotClassName: 'bg-workspace-outcome-answered',
    selectedClassName: 'border-workspace-outcome-answered bg-workspace-outcome-answered/10 text-foreground',
  },
  {
    value: 'not_interested',
    labelKey: 'devicePowerDialer.outcomes.notInterested',
    icon: ThumbsDown,
    dotClassName: 'bg-workspace-outcome-negative',
    selectedClassName: 'border-workspace-outcome-negative bg-workspace-outcome-negative/10 text-foreground',
  },
];

function loadPendingCall(): PendingCall | null {
  if (typeof window === 'undefined') return null;

  try {
    const value = window.sessionStorage.getItem(PENDING_CALL_KEY);
    if (!value) return null;
    const pending = JSON.parse(value) as Partial<PendingCall>;
    if (
      pending.version !== 1 ||
      typeof pending.leadId !== 'string' ||
      typeof pending.startedAt !== 'number' ||
      !['android', 'ios', 'web'].includes(pending.platform ?? '') ||
      !['android_native', 'system_tel'].includes(pending.handoffMethod ?? '')
    ) {
      window.sessionStorage.removeItem(PENDING_CALL_KEY);
      return null;
    }
    return pending as PendingCall;
  } catch {
    window.sessionStorage.removeItem(PENDING_CALL_KEY);
    return null;
  }
}

function storePendingCall(pending: PendingCall | null) {
  if (typeof window === 'undefined') return;
  if (pending) window.sessionStorage.setItem(PENDING_CALL_KEY, JSON.stringify(pending));
  else window.sessionStorage.removeItem(PENDING_CALL_KEY);
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainder = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function toDateTimeLocalValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function getLeadSubtitle(lead: LeadWithOwner) {
  return lead.company_name || lead.email;
}

export default function ColdCallerPage() {
  const { locale, t } = useI18n();
  const demo = isScreenshotDemoMode();
  const demoParams = demo && typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const demoHasLeads = demoParams?.get('leads') !== '0';
  const demoPhoneConnected = demoParams?.get('phone') !== '0';

  const { data: leadsResultReal, isLoading: leadsLoadingReal } = useLeads();
  const { data: recentCallsReal = [], isLoading: callsLoadingReal, error: callsErrorReal } = usePowerDialerCalls();
  const leadsResult = demo ? { data: demoHasLeads ? DEMO_LEADS : [] } : leadsResultReal;
  const leadsLoading = demo ? false : leadsLoadingReal;
  const recentCalls = useMemo(() => (demo ? (DEMO_CALLS ?? []) : recentCallsReal), [demo, recentCallsReal]);
  const callsLoading = demo ? false : callsLoadingReal;
  const callsError = demo ? null : callsErrorReal;
  const logCall = useLogPowerDialerCall();
  const createCallCommand = useCreatePhoneCallCommand();

  const [view, setView] = useState<DialerView>('queue');
  const [platform] = useState<DevicePlatform>(() => getDevicePlatform());
  const [connectedPhone, setConnectedPhone] = useState<ConnectedPhone | null>(() => {
    if (demo) {
      return demoPhoneConnected
        ? { version: 1, deviceId: 'demo', phoneNumber: '', platform: 'web', connectionMode: 'backend_relay', phonePlatform: 'android', computerPlatform: 'mac', status: 'online', lastHeartbeatAt: new Date().toISOString(), connectedAt: new Date().toISOString() }
        : null;
    }
    return loadConnectedPhone();
  });
  const [pendingCall, setPendingCall] = useState<PendingCall | null>(() => loadPendingCall());
  const [processedLeadIds, setProcessedLeadIds] = useState<Set<string>>(() => new Set());
  const [currentLeadIndex, setCurrentLeadIndex] = useState(0);
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [notes, setNotes] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const leadsWithPhone = useMemo(
    () => (leadsResult?.data ?? []).filter((lead) => Boolean(getTelephoneUri(lead.phone ?? ''))),
    [leadsResult?.data],
  );

  const remainingQueue = useMemo(
    () => leadsWithPhone.filter((lead) => !processedLeadIds.has(lead.id)),
    [leadsWithPhone, processedLeadIds],
  );

  const normalizedIndex = remainingQueue.length > 0
    ? currentLeadIndex % remainingQueue.length
    : 0;
  const currentLead = remainingQueue[normalizedIndex];

  const pendingLead = useMemo(
    () => leadsWithPhone.find((lead) => lead.id === pendingCall?.leadId),
    [leadsWithPhone, pendingCall?.leadId],
  );
  const activeLead = pendingLead ?? currentLead;

  useEffect(() => {
    if (!pendingCall) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pendingCall]);

  useEffect(() => {
    if (!pendingCall || leadsLoading || pendingLead) return;
    setPendingCall(null);
    storePendingCall(null);
  }, [leadsLoading, pendingCall, pendingLead]);

  useEffect(() => {
    if (remainingQueue.length === 0) {
      setCurrentLeadIndex(0);
    } else if (currentLeadIndex >= remainingQueue.length) {
      setCurrentLeadIndex(0);
    }
  }, [currentLeadIndex, remainingQueue.length]);

  const durationSeconds = pendingCall
    ? Math.max(0, Math.floor((now - pendingCall.startedAt) / 1000))
    : 0;

  const localeCode = locale === 'da' ? 'da-DK' : locale === 'de' ? 'de-DE' : 'en-GB';
  const callsToday = useMemo(() => {
    const today = new Date().toDateString();
    return recentCalls.filter((call) => new Date(call.dialed_at).toDateString() === today).length;
  }, [recentCalls]);
  const scheduledCallbacks = useMemo(
    () => recentCalls.filter((call) => call.outcome === 'callback' && call.callback_at).length,
    [recentCalls],
  );
  const progress = leadsWithPhone.length > 0
    ? Math.round((processedLeadIds.size / leadsWithPhone.length) * 100)
    : 0;

  const platformMessage = platform === 'android'
    ? t('devicePowerDialer.platform.android')
    : platform === 'ios'
      ? t('devicePowerDialer.platform.ios')
      : t('devicePowerDialer.platform.web');
  const canDialFromThisDevice = isDialerConnectionReady(connectedPhone, platform);

  const clearCallForm = useCallback(() => {
    setPendingCall(null);
    storePendingCall(null);
    setOutcome(null);
    setNotes('');
    setCallbackAt('');
  }, []);

  const handleCallHandoff = useCallback(async (event: MouseEvent<HTMLAnchorElement>) => {
    if (createCallCommand.isPending) {
      event.preventDefault();
      return;
    }
    if (!currentLead?.phone || !canDialFromThisDevice) {
      event.preventDefault();
      if (!canDialFromThisDevice) {
        toast({
          title: t('devicePowerDialer.errors.connectPhoneTitle'),
          description: t('devicePowerDialer.errors.connectPhoneDescription'),
          variant: 'destructive',
        });
      }
      return;
    }

    const handoffMethod = getExpectedHandoffMethod();
    const nextPendingCall: PendingCall = {
      version: 1,
      leadId: currentLead.id,
      startedAt: Date.now(),
      platform,
      handoffMethod,
    };

    if (platform === 'web') {
      event.preventDefault();
      if (!connectedPhone) return;
      try {
        await createCallCommand.mutateAsync({
          deviceId: connectedPhone.deviceId,
          phoneNumber: currentLead.phone,
          leadId: currentLead.id,
          displayName: currentLead.name,
          idempotencyKey: `${currentLead.id}:${nextPendingCall.startedAt}`,
          metadata: { source: 'power_dialer_web' },
        });
      } catch (error) {
        toast({
          title: t('devicePowerDialer.errors.handoffTitle'),
          description: getErrorMessage(error),
          variant: 'destructive',
        });
        return;
      }
    }

    setPendingCall(nextPendingCall);
    storePendingCall(nextPendingCall);
    setNow(nextPendingCall.startedAt);
    setOutcome(null);
    setNotes('');
    setCallbackAt('');

    if (handoffMethod === 'android_native') {
      event.preventDefault();
      try {
        if (!tryAndroidNativeDialer(currentLead.phone)) {
          window.location.assign(getTelephoneUri(currentLead.phone));
        }
      } catch (error) {
        clearCallForm();
        toast({
          title: t('devicePowerDialer.errors.handoffTitle'),
          description: getErrorMessage(error),
          variant: 'destructive',
        });
      }
    }
  }, [canDialFromThisDevice, clearCallForm, connectedPhone, createCallCommand, currentLead, platform, t]);

  const handleOutcomeChange = useCallback((nextOutcome: CallOutcome) => {
    setOutcome(nextOutcome);
    if (nextOutcome === 'callback' && !callbackAt) {
      setCallbackAt(toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
    }
  }, [callbackAt]);

  const handleSaveAndNext = useCallback(async () => {
    if (!activeLead?.phone || !pendingCall || !outcome) return;

    if (outcome === 'callback' && !callbackAt) {
      toast({
        title: t('devicePowerDialer.errors.callbackTitle'),
        description: t('devicePowerDialer.errors.callbackDescription'),
        variant: 'destructive',
      });
      return;
    }

    try {
      await logCall.mutateAsync({
        leadId: activeLead.id,
        phoneNumber: activeLead.phone,
        outcome,
        notes,
        callbackAt: outcome === 'callback' ? new Date(callbackAt).toISOString() : null,
        durationSeconds,
        platform: pendingCall.platform,
        handoffMethod: pendingCall.handoffMethod,
      });

      setProcessedLeadIds((current) => {
        const next = new Set(current);
        next.add(activeLead.id);
        return next;
      });
      clearCallForm();
      toast({
        title: t('devicePowerDialer.saved.title'),
        description: t('devicePowerDialer.saved.description'),
      });
    } catch (error) {
      toast({
        title: t('devicePowerDialer.errors.saveTitle'),
        description: getErrorMessage(error),
        variant: 'destructive',
      });
    }
  }, [activeLead, callbackAt, clearCallForm, durationSeconds, logCall, notes, outcome, pendingCall, t]);

  const handleSkip = useCallback(() => {
    if (remainingQueue.length <= 1) return;
    setCurrentLeadIndex((index) => (index + 1) % remainingQueue.length);
  }, [remainingQueue.length]);

  const handleResetQueue = useCallback(() => {
    clearCallForm();
    setProcessedLeadIds(new Set());
    setCurrentLeadIndex(0);
  }, [clearCallForm]);

  if (leadsLoading) {
    return (
      <div className="flex min-h-[500px] items-center justify-center" role="status">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <span className="sr-only">{t('devicePowerDialer.loading')}</span>
      </div>
    );
  }

  return (
    <WorkspaceFrame className="min-h-[720px] flex-col lg:flex-row">
      <div className="flex w-full flex-col gap-[10px] lg:w-[260px] lg:shrink-0">
        <WorkspaceSidebarPanel
          title={t('devicePowerDialer.queue.title')}
          badge={
            <span className="rounded-full bg-workspace-panel-row px-2 py-0.5 text-[11px] font-semibold text-workspace-ink-on-dark">
              {remainingQueue.length}
            </span>
          }
        >
          {remainingQueue.length === 0 ? (
            <p className="px-1 text-[13px] text-workspace-label-on-dark">{t('devicePowerDialer.complete.title')}</p>
          ) : (
            <ul className="flex max-h-[360px] flex-col gap-1.5 overflow-y-auto">
              {remainingQueue.map((lead, index) => {
                const selected = lead.id === activeLead?.id;
                return (
                  <li key={lead.id}>
                    <WorkspaceActiveRow
                      active={selected}
                      layoutId="dialerActiveLead"
                      disabled={Boolean(pendingCall)}
                      onClick={() => setCurrentLeadIndex(index)}
                    >
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-workspace-ink-on-dark">{lead.name}</p>
                          <p className="truncate text-[11px] text-workspace-label-on-dark">{getLeadSubtitle(lead)}</p>
                        </div>
                        {selected && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-workspace-ink-on-dark" />}
                      </div>
                    </WorkspaceActiveRow>
                  </li>
                );
              })}
            </ul>
          )}
        </WorkspaceSidebarPanel>

        <WorkspaceSidebarPanel title={t('devicePowerDialer.logging.outcome')}>
          <ul className="flex flex-col gap-3">
            {OUTCOMES.map((option) => (
              <li key={option.value} className="flex items-center gap-3 text-[13px] text-workspace-label-on-dark">
                <span className={cn('h-[7px] w-[7px] shrink-0 rounded-full', option.dotClassName)} aria-hidden="true" />
                {t(option.labelKey)}
              </li>
            ))}
          </ul>
        </WorkspaceSidebarPanel>
      </div>

      <WorkspaceGradientSurface>
        <div className="flex flex-wrap items-center gap-3 px-5 pt-5 sm:px-7">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] text-workspace-ink">{t('devicePowerDialer.title')}</h1>
          <button
            type="button"
            onClick={() => setView('setup')}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-[5px] text-[12px] font-semibold text-workspace-ink"
          >
            <span
              className={cn('h-2 w-2 rounded-full', canDialFromThisDevice ? 'bg-workspace-outcome-answered' : 'bg-workspace-outcome-none')}
              aria-hidden="true"
            />
            {canDialFromThisDevice ? t('devicePowerDialer.status.connected') : t('devicePowerDialer.status.disconnected')}
          </button>
          {processedLeadIds.size > 0 ? (
            <WorkspacePillButton onClick={handleResetQueue} className="ml-auto">
              <RotateCcw className="h-4 w-4" />
              {t('devicePowerDialer.resetQueue')}
            </WorkspacePillButton>
          ) : null}
        </div>

        <div className="mt-3 flex justify-end px-5 sm:px-7">
          <SegmentedControl<DialerView>
            layoutId="dialerViewPill"
            value={view}
            onChange={setView}
            options={[
              { value: 'queue', label: t('devicePowerDialer.views.queue') },
              { value: 'history', label: t('devicePowerDialer.views.history') },
              { value: 'setup', label: t('devicePowerDialer.views.setup') },
            ]}
          />
        </div>

        <div className="mt-[14px] grid grid-cols-2 gap-2 px-5 sm:grid-cols-4 sm:px-7" aria-label={t('devicePowerDialer.stats.label')}>
          <WorkspaceTile label={t('devicePowerDialer.stats.remaining')} value={remainingQueue.length} active />
          <WorkspaceTile label={t('devicePowerDialer.stats.session')} value={processedLeadIds.size} />
          <WorkspaceTile label={t('devicePowerDialer.stats.today')} value={callsToday} />
          <WorkspaceTile label={t('devicePowerDialer.stats.callbacks')} value={scheduledCallbacks} />
        </div>

        <WorkspaceSurface className="mt-[14px] rounded-t-[24px]">
          {/* All three views stay mounted and are only hidden with CSS — the
              Setup view's PhoneDeviceConnection polls the backend for a
              verified phone heartbeat, and unmounting it while another tab
              is open would silently stop that detection. */}
          <div className={view === 'queue' ? undefined : 'hidden'}>
          {(
            leadsWithPhone.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/5">
                  <PhoneOff className="h-6 w-6 text-workspace-surface-label" />
                </div>
                <h2 className="text-lg font-semibold">{t('devicePowerDialer.empty.title')}</h2>
                <p className="max-w-md text-sm text-workspace-surface-label">{t('devicePowerDialer.empty.description')}</p>
                <Button asChild className="mt-2 rounded-full bg-workspace-ink text-white hover:bg-workspace-ink/90">
                  <Link to={`/${locale}/app/crm/leads`}>{t('devicePowerDialer.empty.action')}</Link>
                </Button>
              </div>
            ) : remainingQueue.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
                  <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                </div>
                <h2 className="text-lg font-semibold">{t('devicePowerDialer.complete.title')}</h2>
                <p className="max-w-md text-sm text-workspace-surface-label">{t('devicePowerDialer.complete.description')}</p>
                <Button onClick={handleResetQueue} className="mt-2 gap-2 rounded-full bg-workspace-ink text-white hover:bg-workspace-ink/90">
                  <RotateCcw className="h-4 w-4" />
                  {t('devicePowerDialer.complete.action')}
                </Button>
              </div>
            ) : activeLead ? (
              <div className="p-5 sm:p-7">
                <div className="flex items-center justify-between gap-3 text-xs text-workspace-surface-label">
                  <span>{t('devicePowerDialer.progress')}</span>
                  <span>{processedLeadIds.size} / {leadsWithPhone.length}</span>
                </div>
                <Progress value={progress} className="mt-2 h-1.5" />

                <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-workspace-accent/10 text-lg font-bold text-workspace-accent">
                      {activeLead.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <Badge variant="outline" className="mb-2 text-[10px] text-workspace-ink border-workspace-surface-line">
                        {pendingCall ? t('devicePowerDialer.current.returned') : t('devicePowerDialer.current.next')}
                      </Badge>
                      <h2 className="truncate text-2xl font-bold">{activeLead.name}</h2>
                      <p className="truncate text-sm text-workspace-surface-label">{getLeadSubtitle(activeLead)}</p>
                      <p className="mt-1 font-mono text-sm">{activeLead.phone}</p>
                    </div>
                  </div>
                  {!pendingCall ? (
                    <Button variant="ghost" onClick={handleSkip} disabled={remainingQueue.length <= 1}>
                      {t('devicePowerDialer.skip')}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>

                {activeLead.notes ? (
                  <div className="mt-5 rounded-xl border border-workspace-surface-line bg-black/5 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-workspace-surface-label">
                      {t('devicePowerDialer.current.leadNotes')}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{activeLead.notes}</p>
                  </div>
                ) : null}

                {!pendingCall && canDialFromThisDevice ? (
                  <div className="mt-7 space-y-3">
                    <a
                      href={getTelephoneUri(activeLead.phone ?? '')}
                      onClick={handleCallHandoff}
                      className={cn(
                        'flex h-16 w-full items-center justify-center gap-2 rounded-full bg-workspace-ink text-lg font-semibold text-white transition-opacity',
                        createCallCommand.isPending && 'pointer-events-none opacity-50',
                      )}
                    >
                      <PhoneCall className="h-6 w-6" />
                      {t('devicePowerDialer.callAction')} {activeLead.name}
                    </a>
                    <p className="text-center text-xs text-workspace-surface-label">
                      {platform === 'web'
                        ? t('devicePowerDialer.relay.callConfirmation')
                        : t('devicePowerDialer.callConfirmation')}
                    </p>
                  </div>
                ) : !pendingCall ? (
                  <div className="mt-7 rounded-2xl border border-dashed border-workspace-accent/40 bg-workspace-accent/5 p-5 text-center">
                    <Smartphone className="mx-auto h-7 w-7 text-workspace-accent" />
                    <p className="mt-3 text-sm font-semibold">{t('devicePowerDialer.pairing.callLockedTitle')}</p>
                    <p className="mt-1 text-xs text-workspace-surface-label">
                      {platform === 'web'
                        ? t('devicePowerDialer.relay.callLockedDesktop')
                        : t('devicePowerDialer.pairing.callLockedMobile')}
                    </p>
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => setView('setup')}>
                      {t('devicePowerDialer.views.setup')}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-7 space-y-6">
                    <div className="flex items-center justify-between rounded-xl border border-workspace-accent/30 bg-workspace-accent/5 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold">{t('devicePowerDialer.logging.title')}</p>
                        <p className="text-xs text-workspace-surface-label">{t('devicePowerDialer.logging.description')}</p>
                      </div>
                      <Badge variant="outline" className="gap-1 font-mono text-workspace-ink border-workspace-surface-line">
                        <Clock3 className="h-3 w-3" />
                        {formatDuration(durationSeconds)}
                      </Badge>
                    </div>

                    <fieldset>
                      <legend className="mb-3 text-sm font-semibold">{t('devicePowerDialer.logging.outcome')}</legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {OUTCOMES.map((option) => {
                          const Icon = option.icon;
                          const selected = outcome === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => handleOutcomeChange(option.value)}
                              className={cn(
                                'flex min-h-12 items-center gap-3 rounded-xl border border-workspace-surface-line px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                selected && option.selectedClassName,
                              )}
                            >
                              <Icon className="h-4 w-4" />
                              {t(option.labelKey)}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>

                    {outcome === 'callback' ? (
                      <div className="space-y-2">
                        <Label htmlFor="power-dialer-callback">{t('devicePowerDialer.logging.callbackAt')}</Label>
                        <Input
                          id="power-dialer-callback"
                          type="datetime-local"
                          min={toDateTimeLocalValue(new Date())}
                          value={callbackAt}
                          onChange={(event) => setCallbackAt(event.target.value)}
                        />
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label htmlFor="power-dialer-notes">{t('devicePowerDialer.logging.notes')}</Label>
                      <Textarea
                        id="power-dialer-notes"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        placeholder={t('devicePowerDialer.logging.notesPlaceholder')}
                        rows={4}
                      />
                    </div>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                      <Button variant="ghost" onClick={clearCallForm} disabled={logCall.isPending}>
                        {t('devicePowerDialer.logging.cancel')}
                      </Button>
                      <Button
                        size="lg"
                        onClick={handleSaveAndNext}
                        disabled={!outcome || logCall.isPending}
                        className="gap-2"
                      >
                        {logCall.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {t('devicePowerDialer.logging.saveAndNext')}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null
          )}
          </div>

          <div className={view === 'history' ? undefined : 'hidden'}>
            <div>
              {callsError ? (
                <div className="px-5 py-4 text-sm text-workspace-outcome-negative sm:px-7">
                  <p className="font-medium">{t('devicePowerDialer.errors.historyTitle')}</p>
                  <p className="mt-1 text-xs opacity-90">{t('devicePowerDialer.errors.historyDescription')}</p>
                </div>
              ) : null}
              {callsLoading ? (
                <div className="flex items-center justify-center p-8" role="status">
                  <Loader2 className="h-5 w-5 animate-spin text-workspace-accent" />
                </div>
              ) : recentCalls.length === 0 ? (
                <p className="p-8 text-center text-sm text-workspace-surface-label">{t('devicePowerDialer.history.empty')}</p>
              ) : (
                <div className="divide-y divide-workspace-surface-line">
                  {recentCalls.slice(0, 8).map((call) => (
                    <div key={call.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{call.lead?.name ?? call.phone_number}</p>
                        <p className="truncate text-xs text-workspace-surface-label">
                          {call.lead?.company_name ?? call.phone_number}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-workspace-ink border-workspace-surface-line">{t(`devicePowerDialer.outcomes.${outcomeKey(call.outcome)}`)}</Badge>
                        <time className="text-xs text-workspace-surface-label" dateTime={call.dialed_at}>
                          {new Date(call.dialed_at).toLocaleString(localeCode, { dateStyle: 'short', timeStyle: 'short' })}
                        </time>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={cn('p-5 sm:p-7', view === 'setup' ? undefined : 'hidden')}>
            {/* TEMP — demo mode skips the real device-polling component so the
                fake connected state above isn't immediately reset by it. */}
            {!demo && <PhoneDeviceConnection platform={platform} connectedPhone={connectedPhone} onConnectionChange={setConnectedPhone} />}
            <p className="mt-3 text-xs text-workspace-surface-label">{platformMessage}</p>
          </div>
        </WorkspaceSurface>
      </WorkspaceGradientSurface>
    </WorkspaceFrame>
  );
}

function outcomeKey(outcome: string) {
  if (outcome === 'no_answer') return 'noAnswer';
  if (outcome === 'not_interested') return 'notInterested';
  if (outcome === 'callback') return 'callback';
  return 'interested';
}
