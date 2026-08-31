import { useState } from 'react';
import { Bluetooth, Check, CheckCircle2, ExternalLink, Laptop, Link2, LogOut, QrCode, ShieldCheck, Smartphone, Wifi } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n';
import {
  connectComputerRelay,
  connectPhone,
  disconnectPhone,
  getComputerPlatform,
  getPhonePairingUrl,
  type ComputerPlatform,
  type ConnectedPhone,
  type PhonePlatform,
} from '@/lib/phoneDevice';
import type { DevicePlatform } from '@/lib/deviceDialer';
import { cn } from '@/lib/utils';

interface PhoneDeviceConnectionProps {
  platform: DevicePlatform;
  connectedPhone: ConnectedPhone | null;
  onConnectionChange: (phone: ConnectedPhone | null) => void;
}

type RelaySetup = 'mac_iphone' | 'mac_android' | 'windows_iphone' | 'windows_android';

const SETUPS: Record<RelaySetup, { computer: ComputerPlatform; phone: PhonePlatform; helpUrl: string }> = {
  mac_iphone: { computer: 'mac', phone: 'ios', helpUrl: 'https://support.apple.com/102405' },
  mac_android: { computer: 'mac', phone: 'android', helpUrl: 'https://www.aiagencydanmark.dk' },
  windows_iphone: { computer: 'windows', phone: 'ios', helpUrl: 'https://support.microsoft.com/windows/setting-up-calls-in-the-phone-link' },
  windows_android: { computer: 'windows', phone: 'android', helpUrl: 'https://support.microsoft.com/windows/setting-up-calls-in-the-phone-link' },
};

function getSetupKey(phone: ConnectedPhone): RelaySetup | null {
  if (phone.computerPlatform === 'mac' && phone.phonePlatform === 'ios') return 'mac_iphone';
  if (phone.computerPlatform === 'windows' && phone.phonePlatform === 'ios') return 'windows_iphone';
  if (phone.computerPlatform === 'windows' && phone.phonePlatform === 'android') return 'windows_android';
  return null;
}

export function PhoneDeviceConnection({ platform, connectedPhone, onConnectionChange }: PhoneDeviceConnectionProps) {
  const { locale, t } = useI18n();
  const [phoneNumber, setPhoneNumber] = useState(connectedPhone?.phoneNumber ?? '');
  const [validationError, setValidationError] = useState(false);
  const [relaySetup, setRelaySetup] = useState<RelaySetup>(() => getComputerPlatform() === 'mac' ? 'mac_iphone' : 'windows_android');
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const pairingUrl = getPhonePairingUrl(locale);

  if (connectedPhone) {
    const relayKey = getSetupKey(connectedPhone);
    const phoneLabel = connectedPhone.phonePlatform === 'ios' || connectedPhone.platform === 'ios' ? 'iPhone' : 'Android';
    const computerLabel = connectedPhone.computerPlatform === 'mac' ? 'Mac' : 'Windows';
    const isRelay = connectedPhone.connectionMode === 'computer_relay';
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600"><CheckCircle2 className="h-5 w-5" /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{isRelay ? t('devicePowerDialer.relay.connectedTitle') : t('devicePowerDialer.pairing.connectedTitle')}</p>
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">{isRelay ? `${computerLabel} + ${phoneLabel}` : phoneLabel}</Badge>
              </div>
              {connectedPhone.phoneNumber ? <p className="mt-1 font-mono text-sm">{connectedPhone.phoneNumber}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">{isRelay ? t('devicePowerDialer.relay.connectedDescription') : t('devicePowerDialer.pairing.connectedDescription')}</p>
              {relayKey ? <a href={SETUPS[relayKey].helpUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">{t('devicePowerDialer.relay.reopenGuide')}<ExternalLink className="h-3 w-3" /></a> : null}
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { disconnectPhone(); onConnectionChange(null); setCompletedSteps([]); }}>
            <LogOut className="h-4 w-4" />{t('devicePowerDialer.pairing.changePhone')}
          </Button>
        </div>
      </Card>
    );
  }

  if (platform === 'web') {
    const config = SETUPS[relaySetup];
    const steps = [1, 2, 3, 4];
    const allStepsComplete = completedSteps.length === steps.length;
    const toggleStep = (step: number, checked: boolean) => setCompletedSteps((current) => checked ? [...current.filter((value) => value !== step), step] : current.filter((value) => value !== step));
    return (
      <Card className="overflow-hidden border-primary/30 bg-primary/5">
        <div className="border-b border-primary/15 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Laptop className="h-5 w-5" /></div>
            <div>
              <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{t('devicePowerDialer.relay.title')}</p><Badge variant="outline">{t('devicePowerDialer.relay.oneTime')}</Badge></div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t('devicePowerDialer.relay.description')}</p>
            </div>
          </div>
        </div>
        <div className="space-y-5 p-4 sm:p-5">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('devicePowerDialer.relay.chooseCombination')}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(SETUPS) as RelaySetup[]).map((setup) => (
                <button key={setup} type="button" aria-pressed={relaySetup === setup} onClick={() => { setRelaySetup(setup); setCompletedSteps([]); }} className={cn('rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors', relaySetup === setup ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background hover:border-primary/50')}>
                  {t(`devicePowerDialer.relay.combinations.${setup}`)}
                </button>
              ))}
            </div>
          </div>
          {relaySetup === 'mac_android' ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <div className="mx-auto shrink-0 rounded-xl bg-white p-2 sm:mx-0" aria-label={t('devicePowerDialer.relay.macAndroid.qrLabel')}>
                  <QRCodeSVG value={pairingUrl} size={132} level="M" marginSize={1} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <QrCode className="h-5 w-5 text-amber-600" />
                    <p className="font-semibold">{t('devicePowerDialer.relay.macAndroid.title')}</p>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t('devicePowerDialer.relay.macAndroid.description')}</p>
                  <ol className="mt-4 space-y-2">
                    {[1, 2, 3, 4].map((step) => (
                      <li key={step} className="flex gap-2 text-sm">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-semibold text-amber-700">{step}</span>
                        <span>{t(`devicePowerDialer.relay.steps.mac_android.${step}.description`)}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-4 text-xs font-medium text-foreground">{t('devicePowerDialer.relay.macAndroid.audioNotice')}</p>
                </div>
              </div>
            </div>
          ) : (
          <div className="rounded-xl border border-border/70 bg-background p-4">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div><p className="font-semibold">{t('devicePowerDialer.relay.guideTitle')}</p><p className="mt-1 text-xs text-muted-foreground">{t('devicePowerDialer.relay.keepNearby')}</p></div>
              <div className="flex gap-2 text-muted-foreground" aria-hidden="true"><Bluetooth className="h-4 w-4" /><Wifi className="h-4 w-4" /></div>
            </div>
            <div className="space-y-3">
              {steps.map((step) => {
                const checked = completedSteps.includes(step);
                return (
                  <label key={step} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors', checked ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border/70 hover:bg-muted/30')}>
                    <Checkbox checked={checked} onCheckedChange={(value) => toggleStep(step, value === true)} aria-label={t(`devicePowerDialer.relay.steps.${relaySetup}.${step}.title`)} className="mt-0.5" />
                    <span className="min-w-0"><span className="block text-sm font-medium">{step}. {t(`devicePowerDialer.relay.steps.${relaySetup}.${step}.title`)}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{t(`devicePowerDialer.relay.steps.${relaySetup}.${step}.description`)}</span></span>
                  </label>
                );
              })}
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <a href={config.helpUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">{t('devicePowerDialer.relay.officialHelp')}<ExternalLink className="h-3 w-3" /></a>
              <Button disabled={!allStepsComplete} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => onConnectionChange(connectComputerRelay(config.computer, config.phone))}>
                <Check className="h-4 w-4" />{allStepsComplete ? t('devicePowerDialer.relay.finishAction') : t('devicePowerDialer.relay.completeAllSteps')}
              </Button>
            </div>
          </div>
          )}
          <div className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p>{t('devicePowerDialer.relay.privacy')}</p></div>
        </div>
      </Card>
    );
  }

  const handleConnect = () => {
    const phone = connectPhone(phoneNumber, platform);
    setValidationError(!phone);
    if (phone) onConnectionChange(phone);
  };
  return (
    <Card className="border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500"><Smartphone className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1 space-y-4">
          <div><div className="flex items-center gap-2"><p className="font-semibold">{t('devicePowerDialer.pairing.mobileTitle')}</p><Badge variant="outline">{platform === 'ios' ? 'iPhone' : 'Android'}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{t('devicePowerDialer.pairing.mobileDescription')}</p><p className="mt-2 text-xs font-medium text-foreground">{platform === 'ios' ? t('devicePowerDialer.pairing.iosInstallTip') : t('devicePowerDialer.pairing.androidInstallTip')}</p></div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-2"><Label htmlFor="power-dialer-own-number">{t('devicePowerDialer.pairing.ownNumberLabel')}</Label><Input id="power-dialer-own-number" type="tel" inputMode="tel" autoComplete="tel" value={phoneNumber} onChange={(event) => { setPhoneNumber(event.target.value); setValidationError(false); }} placeholder={t('devicePowerDialer.pairing.ownNumberPlaceholder')} aria-invalid={validationError} />{validationError ? <p className="text-xs text-destructive">{t('devicePowerDialer.pairing.invalidNumber')}</p> : null}</div>
            <Button onClick={handleConnect} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"><Link2 className="h-4 w-4" />{t('devicePowerDialer.pairing.connectAction')}</Button>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><p>{t('devicePowerDialer.pairing.privacy')}</p></div>
        </div>
      </div>
    </Card>
  );
}
