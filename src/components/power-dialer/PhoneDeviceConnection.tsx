import { useMemo, useState } from 'react';
import { CheckCircle2, Link2, LogOut, QrCode, ShieldCheck, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n';
import {
  connectPhone,
  disconnectPhone,
  getPhonePairingUrl,
  type ConnectedPhone,
} from '@/lib/phoneDevice';
import type { DevicePlatform } from '@/lib/deviceDialer';

interface PhoneDeviceConnectionProps {
  platform: DevicePlatform;
  connectedPhone: ConnectedPhone | null;
  onConnectionChange: (phone: ConnectedPhone | null) => void;
}

export function PhoneDeviceConnection({
  platform,
  connectedPhone,
  onConnectionChange,
}: PhoneDeviceConnectionProps) {
  const { locale, t } = useI18n();
  const [phoneNumber, setPhoneNumber] = useState(connectedPhone?.phoneNumber ?? '');
  const [validationError, setValidationError] = useState(false);
  const pairingUrl = useMemo(() => getPhonePairingUrl(locale), [locale]);

  if (platform === 'web') {
    return (
      <Card className="border-primary/30 bg-primary/5 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="mx-auto shrink-0 rounded-xl bg-white p-2 sm:mx-0" aria-label={t('devicePowerDialer.pairing.qrLabel')}>
            <QRCodeSVG value={pairingUrl} size={112} level="M" marginSize={1} />
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              <p className="font-semibold">{t('devicePowerDialer.pairing.desktopTitle')}</p>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t('devicePowerDialer.pairing.desktopDescription')}
            </p>
            <p className="text-xs font-medium text-foreground">{t('devicePowerDialer.pairing.desktopSteps')}</p>
          </div>
        </div>
      </Card>
    );
  }

  if (connectedPhone) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{t('devicePowerDialer.pairing.connectedTitle')}</p>
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
                  {platform === 'ios' ? 'iPhone' : 'Android'}
                </Badge>
              </div>
              <p className="mt-1 font-mono text-sm">{connectedPhone.phoneNumber}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('devicePowerDialer.pairing.connectedDescription')}</p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              disconnectPhone();
              onConnectionChange(null);
            }}
          >
            <LogOut className="h-4 w-4" />
            {t('devicePowerDialer.pairing.changePhone')}
          </Button>
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
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold">{t('devicePowerDialer.pairing.mobileTitle')}</p>
              <Badge variant="outline">{platform === 'ios' ? 'iPhone' : 'Android'}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t('devicePowerDialer.pairing.mobileDescription')}</p>
            <p className="mt-2 text-xs font-medium text-foreground">
              {platform === 'ios'
                ? t('devicePowerDialer.pairing.iosInstallTip')
                : t('devicePowerDialer.pairing.androidInstallTip')}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="power-dialer-own-number">{t('devicePowerDialer.pairing.ownNumberLabel')}</Label>
              <Input
                id="power-dialer-own-number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phoneNumber}
                onChange={(event) => {
                  setPhoneNumber(event.target.value);
                  setValidationError(false);
                }}
                placeholder={t('devicePowerDialer.pairing.ownNumberPlaceholder')}
                aria-invalid={validationError}
              />
              {validationError ? (
                <p className="text-xs text-destructive">{t('devicePowerDialer.pairing.invalidNumber')}</p>
              ) : null}
            </div>
            <Button onClick={handleConnect} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
              <Link2 className="h-4 w-4" />
              {t('devicePowerDialer.pairing.connectAction')}
            </Button>
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <p>{t('devicePowerDialer.pairing.privacy')}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
