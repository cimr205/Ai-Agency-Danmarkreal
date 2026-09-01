import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  PhoneCall,
  PhoneOff,
  RotateCcw,
  Smartphone,
  ThumbsDown,
  ThumbsUp,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PhoneDeviceConnection } from '@/components/power-dialer/PhoneDeviceConnection';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useLeads, type LeadWithOwner } from '@/hooks/api/useLeads';
import {
  useLogPowerDialerCall,
  usePowerDialerCalls,
  type CallOutcome,
} from '@/hooks/api/usePowerDialer';
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
  selectedClassName: string;
}> = [
  {
    value: 'no_answer',
    labelKey: 'devicePowerDialer.outcomes.noAnswer',
    icon: PhoneOff,
    selectedClassName: 'border-muted-foreground bg-muted text-foreground',
  },
  {
    value: 'callback',
    labelKey: 'devicePowerDialer.outcomes.callback',
    icon: CalendarClock,
    selectedClassName: 'border-amber-500 bg-amber-500/10 text-amber-400',
  },
  {
    value: 'interested',
    labelKey: 'devicePowerDialer.outcomes.interested',
    icon: ThumbsUp,
    selectedClassName: 'border-emerald-500 bg-emerald-500/10 text-emerald-400',
  },
  {
    value: 'not_interested',
    labelKey: 'devicePowerDialer.outcomes.notInterested',
    icon: ThumbsDown,
    selectedClassName: 'border-red-500 bg-red-500/10 text-red-400',
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
  const { data: leadsResult, isLoading: leadsLoading } = useLeads();
  const { data: recentCalls = [], isLoading: callsLoading, error: callsError } = usePowerDialerCalls();
  const logCall = useLogPowerDialerCall();

  const [platform] = useState<DevicePlatform>(() => getDevicePlatform());
  const [connectedPhone, setConnectedPhone] = useState<ConnectedPhone | null>(() => loadConnectedPhone());
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

  const handleCallHandoff = useCallback((event: MouseEvent<HTMLAnchorElement>) => {
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
  }, [canDialFromThisDevice, clearCallForm, currentLead, platform, t]);

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
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Smartphone className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('devicePowerDialer.title')}</h1>
              <p className="text-sm text-muted-foreground">{t('devicePowerDialer.subtitle')}</p>
            </div>
          </div>
          <div className="max-w-3xl space-y-2">
            <PhoneDeviceConnection
              platform={platform}
              connectedPhone={connectedPhone}
              onConnectionChange={setConnectedPhone}
            />
            <p className="px-1 text-xs text-muted-foreground">{platformMessage}</p>
          </div>
        </div>
        {processedLeadIds.size > 0 ? (
          <Button variant="outline" onClick={handleResetQueue} className="gap-2">
            <RotateCcw className="h-4 w-4" />
            {t('devicePowerDialer.resetQueue')}
          </Button>
        ) : null}
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={t('devicePowerDialer.stats.label')}>
        <StatCard icon={Users} label={t('devicePowerDialer.stats.remaining')} value={remainingQueue.length} />
        <StatCard icon={CheckCircle2} label={t('devicePowerDialer.stats.session')} value={processedLeadIds.size} />
        <StatCard icon={PhoneCall} label={t('devicePowerDialer.stats.today')} value={callsToday} />
        <StatCard icon={CalendarClock} label={t('devicePowerDialer.stats.callbacks')} value={scheduledCallbacks} />
      </section>

      {callsError ? (
        <Card className="border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <p className="font-medium">{t('devicePowerDialer.errors.historyTitle')}</p>
          <p className="mt-1 text-xs opacity-90">{t('devicePowerDialer.errors.historyDescription')}</p>
        </Card>
      ) : null}

      {leadsWithPhone.length === 0 ? (
        <Card className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <PhoneOff className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold">{t('devicePowerDialer.empty.title')}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{t('devicePowerDialer.empty.description')}</p>
          <Button asChild className="mt-5">
            <Link to={`/${locale}/app/crm/leads`}>{t('devicePowerDialer.empty.action')}</Link>
          </Button>
        </Card>
      ) : remainingQueue.length === 0 ? (
        <Card className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-7 w-7 text-emerald-500" />
          </div>
          <h2 className="text-lg font-semibold">{t('devicePowerDialer.complete.title')}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{t('devicePowerDialer.complete.description')}</p>
          <Button onClick={handleResetQueue} className="mt-5 gap-2">
            <RotateCcw className="h-4 w-4" />
            {t('devicePowerDialer.complete.action')}
          </Button>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="overflow-hidden">
            <div className="border-b border-border/60 px-5 py-4">
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>{t('devicePowerDialer.progress')}</span>
                <span>{processedLeadIds.size} / {leadsWithPhone.length}</span>
              </div>
              <Progress value={progress} className="mt-2 h-1.5" />
            </div>

            {activeLead ? (
              <div className="p-5 sm:p-7">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primary">
                      {activeLead.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <Badge variant="outline" className="mb-2 text-[10px]">
                        {pendingCall ? t('devicePowerDialer.current.returned') : t('devicePowerDialer.current.next')}
                      </Badge>
                      <h2 className="truncate text-2xl font-bold">{activeLead.name}</h2>
                      <p className="truncate text-sm text-muted-foreground">{getLeadSubtitle(activeLead)}</p>
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
                  <div className="mt-5 rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {t('devicePowerDialer.current.leadNotes')}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{activeLead.notes}</p>
                  </div>
                ) : null}

                {!pendingCall && canDialFromThisDevice ? (
                  <div className="mt-7 space-y-3">
                    <Button
                      asChild
                      size="xl"
                      className="h-16 w-full rounded-2xl bg-emerald-600 text-lg text-white shadow-lg shadow-emerald-950/20 hover:bg-emerald-700"
                    >
                      <a href={getTelephoneUri(activeLead.phone ?? '')} onClick={handleCallHandoff}>
                        <PhoneCall className="h-6 w-6" />
                        {t('devicePowerDialer.callAction')} {activeLead.name}
                      </a>
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      {platform === 'web'
                        ? t('devicePowerDialer.relay.callConfirmation')
                        : t('devicePowerDialer.callConfirmation')}
                    </p>
                  </div>
                ) : !pendingCall ? (
                  <div className="mt-7 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-5 text-center">
                    <Smartphone className="mx-auto h-7 w-7 text-primary" />
                    <p className="mt-3 text-sm font-semibold">{t('devicePowerDialer.pairing.callLockedTitle')}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {platform === 'web'
                        ? t('devicePowerDialer.relay.callLockedDesktop')
                        : t('devicePowerDialer.pairing.callLockedMobile')}
                    </p>
                  </div>
                ) : (
                  <div className="mt-7 space-y-6">
                    <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                      <div>
                        <p className="text-sm font-semibold">{t('devicePowerDialer.logging.title')}</p>
                        <p className="text-xs text-muted-foreground">{t('devicePowerDialer.logging.description')}</p>
                      </div>
                      <Badge variant="outline" className="gap-1 font-mono">
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
                                'flex min-h-12 items-center gap-3 rounded-xl border border-border/70 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
            ) : null}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">{t('devicePowerDialer.queue.title')}</h2>
              </div>
              <Badge variant="secondary">{remainingQueue.length}</Badge>
            </div>
            <div className="max-h-[580px] divide-y divide-border/40 overflow-y-auto">
              {remainingQueue.map((lead, index) => {
                const selected = lead.id === activeLead?.id;
                return (
                  <button
                    key={lead.id}
                    type="button"
                    disabled={Boolean(pendingCall)}
                    onClick={() => setCurrentLeadIndex(index)}
                    className={cn(
                      'w-full px-4 py-3 text-left transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60',
                      selected && 'bg-primary/5',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{lead.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{getLeadSubtitle(lead)}</p>
                      </div>
                      {selected ? <ArrowRight className="h-4 w-4 shrink-0 text-primary" /> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border/60 px-5 py-4">
          <History className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">{t('devicePowerDialer.history.title')}</h2>
        </div>
        {callsLoading ? (
          <div className="flex items-center justify-center p-8" role="status">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : recentCalls.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('devicePowerDialer.history.empty')}</p>
        ) : (
          <div className="divide-y divide-border/40">
            {recentCalls.slice(0, 8).map((call) => (
              <div key={call.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{call.lead?.name ?? call.phone_number}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {call.lead?.company_name ?? call.phone_number}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline">{t(`devicePowerDialer.outcomes.${outcomeKey(call.outcome)}`)}</Badge>
                  <time className="text-xs text-muted-foreground" dateTime={call.dialed_at}>
                    {new Date(call.dialed_at).toLocaleString(localeCode, { dateStyle: 'short', timeStyle: 'short' })}
                  </time>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function outcomeKey(outcome: string) {
  if (outcome === 'no_answer') return 'noAnswer';
  if (outcome === 'not_interested') return 'notInterested';
  if (outcome === 'callback') return 'callback';
  return 'interested';
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tabular-nums">{value}</p>
      </div>
    </Card>
  );
}
