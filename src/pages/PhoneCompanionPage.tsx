import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, PhoneCall, PhoneOff, ShieldCheck, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { getTelephoneUri } from '@/lib/deviceDialer';
import { getErrorMessage } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';

const DEVICE_CREDENTIALS_KEY = 'power-dialer-companion-v1';

interface DeviceCredentials {
  version: 1;
  deviceId: string;
  deviceToken: string;
  platform: 'ios' | 'android';
  displayName: string;
}

interface CallCommand {
  id: string;
  phone_number: string;
  normalized_phone: string;
  display_name: string | null;
  requires_confirmation: boolean;
  expires_at: string;
  status: string;
}

function detectPhonePlatform(): 'ios' | 'android' {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'android';
}

function loadCredentials(): DeviceCredentials | null {
  try {
    const raw = localStorage.getItem(DEVICE_CREDENTIALS_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<DeviceCredentials>;
    return value.version === 1 && value.deviceId && value.deviceToken && value.platform && value.displayName
      ? value as DeviceCredentials
      : null;
  } catch {
    return null;
  }
}

async function invokeRelay<T>(body: Record<string, unknown>, deviceToken?: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('phone-device-relay', {
    body,
    headers: deviceToken ? { Authorization: `Bearer ${deviceToken}` } : undefined,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export default function PhoneCompanionPage() {
  const { t } = useI18n();
  const [{ pairingSessionId, pairingSecret }] = useState(() => {
    const query = new URLSearchParams(window.location.search);
    const params = { pairingSessionId: query.get('session') ?? '', pairingSecret: query.get('secret') ?? '' };
    if (params.pairingSessionId || params.pairingSecret) window.history.replaceState({}, '', window.location.pathname);
    return params;
  });
  const [shortCode, setShortCode] = useState('');
  const [displayName, setDisplayName] = useState(() => detectPhonePlatform() === 'ios' ? 'Min iPhone' : 'Min Android');
  const [credentials, setCredentials] = useState<DeviceCredentials | null>(() => loadCredentials());
  const [command, setCommand] = useState<CallCommand | null>(null);
  const [isPairing, setIsPairing] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const platform = useMemo(() => detectPhonePlatform(), []);

  const sendEvent = useCallback(async (activeCommand: CallCommand, eventType: string, payload: Record<string, unknown> = {}) => {
    if (!credentials) return;
    await invokeRelay({
      action: 'event',
      command_id: activeCommand.id,
      event_id: crypto.randomUUID(),
      event_type: eventType,
      payload,
      occurred_at: new Date().toISOString(),
    }, credentials.deviceToken);
  }, [credentials]);

  useEffect(() => {
    if (!credentials) return;
    let active = true;
    let pollTimer = 0;
    let heartbeatTimer = 0;

    const heartbeat = async () => {
      try {
        await invokeRelay({
          action: 'heartbeat',
          app_version: 'web-companion-1',
          capabilities: { direct_carrier_call: false, web_companion: true },
        }, credentials.deviceToken);
        if (active) {
          setLastHeartbeat(new Date().toISOString());
          setConnectionError('');
        }
      } catch (error) {
        if (active) setConnectionError(getErrorMessage(error));
      } finally {
        if (active) heartbeatTimer = window.setTimeout(heartbeat, 25_000);
      }
    };

    const poll = async () => {
      try {
        const response = await invokeRelay<{ commands: CallCommand[] }>({ action: 'poll' }, credentials.deviceToken);
        if (active && response.commands?.length) {
          const next = response.commands[0];
          setCommand(next);
          if (next.status === 'delivered') void sendEvent(next, 'acknowledged');
        }
      } catch (error) {
        if (active) setConnectionError(getErrorMessage(error));
      } finally {
        if (active) pollTimer = window.setTimeout(poll, 2_000);
      }
    };

    void heartbeat();
    void poll();
    return () => {
      active = false;
      window.clearTimeout(pollTimer);
      window.clearTimeout(heartbeatTimer);
    };
  }, [credentials, sendEvent]);

  const handlePair = async () => {
    if ((!pairingSecret && shortCode.length !== 6) || !displayName.trim()) return;
    setIsPairing(true);
    setConnectionError('');
    try {
      const response = await invokeRelay<{ device_id: string; device_token: string }>({
        action: 'claim',
        pairing_session_id: pairingSessionId || undefined,
        pairing_secret: pairingSecret || undefined,
        short_code: pairingSecret ? undefined : shortCode,
        display_name: displayName.trim(),
        platform,
        app_version: 'web-companion-1',
        capabilities: { direct_carrier_call: false, web_companion: true },
      });
      const next: DeviceCredentials = {
        version: 1,
        deviceId: response.device_id,
        deviceToken: response.device_token,
        platform,
        displayName: displayName.trim(),
      };
      localStorage.setItem(DEVICE_CREDENTIALS_KEY, JSON.stringify(next));
      setCredentials(next);
      window.history.replaceState({}, '', window.location.pathname);
    } catch (error) {
      setConnectionError(getErrorMessage(error));
    } finally {
      setIsPairing(false);
    }
  };

  const startCall = () => {
    if (!command) return;
    setCommand({ ...command, status: 'ringing' });
    void sendEvent(command, 'ringing');
    window.location.assign(getTelephoneUri(command.normalized_phone));
  };

  const finishCommand = async (eventType: 'completed' | 'rejected') => {
    if (!command) return;
    try {
      await sendEvent(command, eventType);
      setCommand(null);
    } catch (error) {
      setConnectionError(getErrorMessage(error));
    }
  };

  if (!credentials) {
    return (
      <main className="min-h-screen bg-muted/30 px-4 py-10">
        <Card className="mx-auto max-w-lg p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Smartphone className="h-6 w-6" /></div>
          <h1 className="mt-5 text-2xl font-bold">{t('phoneCompanion.pairTitle')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('phoneCompanion.pairDescription')}</p>
          {!pairingSessionId ? <p className="mt-5 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">{t('phoneCompanion.manualPrompt')}</p> : null}
          <div className="mt-6 space-y-4">
            <div className="space-y-2"><Label htmlFor="companion-name">{t('phoneCompanion.deviceName')}</Label><Input id="companion-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} /></div>
            {!pairingSecret ? <div className="space-y-2"><Label htmlFor="companion-code">{t('phoneCompanion.code')}</Label><Input id="companion-code" value={shortCode} onChange={(event) => setShortCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" className="font-mono text-xl tracking-[0.3em]" /></div> : null}
            {connectionError ? <p role="alert" className="text-sm text-destructive">{connectionError}</p> : null}
            <Button className="h-12 w-full gap-2" disabled={isPairing || (!pairingSecret && shortCode.length !== 6)} onClick={handlePair}>{isPairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{t('phoneCompanion.pairAction')}</Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-lg space-y-4">
        <Card className="border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 text-emerald-600" /><div><h1 className="font-semibold">{t('phoneCompanion.onlineTitle')}</h1><p className="text-sm text-muted-foreground">{credentials.displayName} · {lastHeartbeat ? t('phoneCompanion.online') : t('phoneCompanion.connecting')}</p></div></div>
        </Card>
        {command ? (
          <Card className="p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('phoneCompanion.incoming')}</p>
            <h2 className="mt-3 text-2xl font-bold">{command.display_name || command.normalized_phone}</h2>
            <p className="mt-1 font-mono text-lg text-muted-foreground">{command.normalized_phone}</p>
            <Button className="mt-6 h-14 w-full gap-2 bg-emerald-600 text-lg text-white hover:bg-emerald-700" onClick={startCall}><PhoneCall className="h-5 w-5" />{t('phoneCompanion.callAction')}</Button>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {['ringing', 'connected'].includes(command.status) ? <Button variant="outline" onClick={() => finishCommand('completed')}><CheckCircle2 className="h-4 w-4" />{t('phoneCompanion.completed')}</Button> : null}
              <Button variant="outline" onClick={() => finishCommand('rejected')}><PhoneOff className="h-4 w-4" />{t('phoneCompanion.reject')}</Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{t('phoneCompanion.confirmation')}</p>
          </Card>
        ) : (
          <Card className="p-8 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" /><h2 className="mt-4 font-semibold">{t('phoneCompanion.waitingTitle')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('phoneCompanion.waitingDescription')}</p></Card>
        )}
        {connectionError ? <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{connectionError}</p> : null}
      </div>
    </main>
  );
}
