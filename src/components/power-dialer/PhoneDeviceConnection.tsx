import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Laptop, Link2, Loader2, LogOut, QrCode, ShieldCheck, Smartphone, Wifi } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreatePhonePairingSession, usePhoneDevices, useRevokePhoneDevice } from '@/hooks/api/usePhoneDeviceRelay';
import { toast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import { connectPhone, disconnectPhone, getComputerPlatform, type ConnectedPhone } from '@/lib/phoneDevice';
import type { DevicePlatform } from '@/lib/deviceDialer';

interface PhoneDeviceConnectionProps {
  platform: DevicePlatform;
  connectedPhone: ConnectedPhone | null;
  onConnectionChange: (phone: ConnectedPhone | null) => void;
}

const ONLINE_WINDOW_MS = 75_000;

function isRecentlyOnline(status: string, heartbeat: string | null, now: number) {
  return status === 'online' && Boolean(heartbeat) && now - new Date(heartbeat as string).getTime() < ONLINE_WINDOW_MS;
}

export function PhoneDeviceConnection({ platform, connectedPhone, onConnectionChange }: PhoneDeviceConnectionProps) {
  const { locale, t } = useI18n();
  const [phoneNumber, setPhoneNumber] = useState(connectedPhone?.phoneNumber ?? '');
  const [validationError, setValidationError] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const devices = usePhoneDevices(platform === 'web');
  const createPairing = useCreatePhonePairingSession();
  const revokeDevice = useRevokePhoneDevice();
  const onlineDevice = useMemo(
    () => devices.data?.find((device) => isRecentlyOnline(device.status, device.last_heartbeat_at, clock)) ?? null,
    [clock, devices.data],
  );

  useEffect(() => {
    if (platform !== 'web') return;
    const timer = window.setInterval(() => setClock(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, [platform]);

  useEffect(() => {
    if (platform !== 'web') return;
    if (!onlineDevice) {
      if (connectedPhone?.connectionMode === 'backend_relay') onConnectionChange(null);
      return;
    }
    if (connectedPhone?.deviceId === onlineDevice.id && connectedPhone.status === 'online') return;
    onConnectionChange({
      version: 1,
      deviceId: onlineDevice.id,
      phoneNumber: '',
      platform: 'web',
      connectionMode: 'backend_relay',
      phonePlatform: onlineDevice.platform === 'ios' ? 'ios' : 'android',
      computerPlatform: getComputerPlatform(),
      status: 'online',
      lastHeartbeatAt: onlineDevice.last_heartbeat_at,
      connectedAt: onlineDevice.paired_at,
    });
  }, [connectedPhone, onlineDevice, onConnectionChange, platform]);

  const pairing = createPairing.data;
  const pairingUrl = pairing && typeof window !== 'undefined'
    ? `${window.location.origin}/${locale}/phone-companion?session=${encodeURIComponent(pairing.pairing_session_id)}&secret=${encodeURIComponent(pairing.pairing_secret)}`
    : '';

  if (platform === 'web' && onlineDevice && connectedPhone?.connectionMode === 'backend_relay') {
    const phoneLabel = onlineDevice.platform === 'ios' ? 'iPhone' : 'Android';
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{t('devicePowerDialer.backendRelay.connectedTitle')}</p><Badge className="bg-emerald-600 text-white hover:bg-emerald-600">{onlineDevice.display_name} · {phoneLabel}</Badge></div>
              <p className="mt-1 text-xs text-muted-foreground">{t('devicePowerDialer.backendRelay.connectedDescription')}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" disabled={revokeDevice.isPending} className="gap-2" onClick={async () => {
            try {
              await revokeDevice.mutateAsync(onlineDevice.id);
              disconnectPhone();
              onConnectionChange(null);
            } catch (error) {
              toast({ title: t('devicePowerDialer.backendRelay.disconnectError'), description: getErrorMessage(error), variant: 'destructive' });
            }
          }}>
            {revokeDevice.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}{t('devicePowerDialer.pairing.changePhone')}
          </Button>
        </div>
      </Card>
    );
  }

  if (platform === 'web') {
    return (
      <Card className="overflow-hidden border-primary/30 bg-primary/5">
        <div className="border-b border-primary/15 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Laptop className="h-5 w-5" /></div>
            <div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{t('devicePowerDialer.backendRelay.title')}</p><Badge variant="outline">{t('devicePowerDialer.relay.oneTime')}</Badge></div><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('devicePowerDialer.backendRelay.description')}</p></div>
          </div>
        </div>
        <div className="space-y-5 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={t('devicePowerDialer.relay.chooseCombination')}>
            {['Mac + iPhone', 'Mac + Android', 'Windows + iPhone', 'Windows + Android'].map((combination) => <div key={combination} className="rounded-lg border bg-background px-3 py-2 text-center text-xs font-medium">{combination}</div>)}
          </div>
          {!pairing ? (
            <div className="rounded-xl border bg-background p-5 text-center">
              <QrCode className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-3 font-semibold">{t('devicePowerDialer.backendRelay.startTitle')}</p>
              <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">{t('devicePowerDialer.backendRelay.startDescription')}</p>
              <Button className="mt-4 gap-2" disabled={createPairing.isPending} onClick={() => createPairing.mutate(undefined, { onError: (error) => toast({ title: t('devicePowerDialer.backendRelay.pairError'), description: getErrorMessage(error), variant: 'destructive' }) })}>
                {createPairing.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}{t('devicePowerDialer.backendRelay.startAction')}
              </Button>
            </div>
          ) : (
            <div className="grid gap-5 rounded-xl border bg-background p-4 sm:grid-cols-[auto_1fr] sm:p-5">
              <div className="mx-auto rounded-xl bg-white p-2 sm:mx-0" aria-label={t('devicePowerDialer.backendRelay.qrLabel')}><QRCodeSVG value={pairingUrl} size={156} level="M" marginSize={1} /></div>
              <div className="min-w-0">
                <div className="flex items-center gap-2"><Wifi className="h-5 w-5 text-primary" /><p className="font-semibold">{t('devicePowerDialer.backendRelay.waitingTitle')}</p></div>
                <ol className="mt-3 space-y-2 text-sm text-muted-foreground"><li>1. {t('devicePowerDialer.backendRelay.step1')}</li><li>2. {t('devicePowerDialer.backendRelay.step2')}</li><li>3. {t('devicePowerDialer.backendRelay.step3')}</li></ol>
                <div className="mt-4 rounded-lg border border-dashed px-4 py-3"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('devicePowerDialer.backendRelay.manualCode')}</p><p className="mt-1 font-mono text-2xl font-bold tracking-[0.3em]">{pairing.short_code}</p></div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('devicePowerDialer.backendRelay.waiting')}</div>
              </div>
            </div>
          )}
          {devices.error ? <p role="alert" className="text-sm text-destructive">{t('devicePowerDialer.backendRelay.loadError')}</p> : null}
          <div className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p>{t('devicePowerDialer.backendRelay.privacy')}</p></div>
        </div>
      </Card>
    );
  }

  const handleConnect = () => {
    const phone = connectPhone(phoneNumber, platform);
    setValidationError(!phone);
    if (phone) onConnectionChange(phone);
  };

  if (connectedPhone) {
    return <Card className="border-emerald-500/30 bg-emerald-500/5 p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><p className="font-semibold">{t('devicePowerDialer.pairing.connectedTitle')}</p><p className="font-mono text-sm">{connectedPhone.phoneNumber}</p></div></div><Button variant="outline" size="sm" onClick={() => { disconnectPhone(); onConnectionChange(null); }}><LogOut className="h-4 w-4" />{t('devicePowerDialer.pairing.changePhone')}</Button></div></Card>;
  }

  return (
    <Card className="border-amber-500/30 bg-amber-500/5 p-4"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500"><Smartphone className="h-5 w-5" /></div><div className="min-w-0 flex-1 space-y-4"><div><p className="font-semibold">{t('devicePowerDialer.pairing.mobileTitle')}</p><p className="mt-1 text-sm text-muted-foreground">{t('devicePowerDialer.pairing.mobileDescription')}</p></div><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><div className="space-y-2"><Label htmlFor="power-dialer-own-number">{t('devicePowerDialer.pairing.ownNumberLabel')}</Label><Input id="power-dialer-own-number" type="tel" inputMode="tel" autoComplete="tel" value={phoneNumber} onChange={(event) => { setPhoneNumber(event.target.value); setValidationError(false); }} placeholder={t('devicePowerDialer.pairing.ownNumberPlaceholder')} aria-invalid={validationError} />{validationError ? <p className="text-xs text-destructive">{t('devicePowerDialer.pairing.invalidNumber')}</p> : null}</div><Button onClick={handleConnect} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"><Link2 className="h-4 w-4" />{t('devicePowerDialer.pairing.connectAction')}</Button></div></div></div></Card>
  );
}
