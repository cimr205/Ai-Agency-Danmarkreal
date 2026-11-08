import { Check, Crown, Loader2, Users, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { showError } from '@/lib/showError';
import { useI18n } from '@/lib/i18n';

const FEATURE_KEYS = [
  'subscription.feature1',
  'subscription.feature2',
  'subscription.feature3',
  'subscription.feature4',
  'subscription.feature5',
  'subscription.feature6',
  'subscription.feature7',
  'subscription.feature8',
  'subscription.feature9',
  'subscription.feature10',
];

export default function SubscriptionPage() {
  const { subscribed, status, trialEndsAt, periodEnd, seatLimit, seatMismatch, isLoading, startCheckout, openPortal, checkSubscription, confirmSeatSync } = useSubscription();
  const { isAdmin } = useAuth();
  const { t, locale } = useI18n();

  const handleSubscribe = async () => {
    try {
      await startCheckout();
    } catch (e) {
      showError(e, { module: 'create-checkout' });
    }
  };

  const handleManage = async () => {
    try {
      await openPortal();
    } catch (e) {
      showError(e, { module: 'customer-portal' });
    }
  };

  const handleConfirmSeatSync = async () => {
    try {
      await confirmSeatSync();
    } catch (e) {
      showError(e, { module: 'check-subscription' });
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'active': return <Badge className="bg-success text-success-foreground">{t('subscription.statusActive')}</Badge>;
      case 'trialing': return <Badge className="bg-warning text-warning-foreground">{t('subscription.statusTrialing')}</Badge>;
      case 'past_due': return <Badge variant="destructive">{t('subscription.statusPastDue')}</Badge>;
      case 'canceled': return <Badge variant="secondary">{t('subscription.statusCanceled')}</Badge>;
      default: return <Badge variant="outline">{t('subscription.statusNone')}</Badge>;
    }
  };

  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{t('subscription.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subscription.subtitle')}</p>
      </div>

      {/* Current Status */}
      <Card className={subscribed ? 'border-primary/30' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="w-4 h-4 text-primary" />
              {t('subscription.planName')}
            </CardTitle>
            {getStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold">499</span>
            <span className="text-muted-foreground">{t('subscription.priceSuffix')}</span>
          </div>

          {subscribed && seatLimit > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              {t('subscription.seatCount').replace('{n}', String(seatLimit))}
            </div>
          )}

          {status === 'trialing' && trialDaysLeft > 0 && (
            <div className="bg-warning/10 text-warning rounded-lg px-3 py-2 text-sm">
              {t('subscription.trialDaysLeft').replace('{days}', String(trialDaysLeft))}
            </div>
          )}

          {seatMismatch && isAdmin && (
            <div className="flex items-start gap-3 bg-warning/10 text-warning rounded-lg px-3 py-2.5 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p>{t('subscription.seatMismatch')
                  .replace('{active}', String(seatMismatch.activeUsers))
                  .replace('{purchased}', String(seatMismatch.purchasedSeats))}</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={handleConfirmSeatSync} disabled={isLoading}>
                  {t('subscription.confirmSeatSync')}
                </Button>
              </div>
            </div>
          )}

          {periodEnd && subscribed && (
            <p className="text-xs text-muted-foreground">
              {t('subscription.nextPayment').replace('{date}', new Date(periodEnd).toLocaleDateString(locale === 'da' ? 'da-DK' : locale === 'de' ? 'de-DE' : 'en-GB'))}
            </p>
          )}

          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {FEATURE_KEYS.map(key => (
              <li key={key} className="flex items-center gap-2 text-sm">
                <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="text-foreground/80">{t(key)}</span>
              </li>
            ))}
          </ul>

          <div className="flex gap-3 pt-2">
            {subscribed ? (
              <Button onClick={handleManage} variant="outline">
                {t('subscription.manageSubscription')}
              </Button>
            ) : (
              <Button onClick={handleSubscribe} disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {t('subscription.startTrial')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => checkSubscription()} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('subscription.refreshStatus')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
