import { Check, Crown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useSubscription } from '@/hooks/useSubscription';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';
import { getErrorMessage } from '@/lib/errors';

const FEATURES = [
  'Ubegrænsede leads & deals',
  'AI-drevet ICP scoring',
  'Pipeline management',
  'Email integration (Gmail)',
  'Massemail kampagner',
  'HR & Workforce moduler',
  'Fakturering & betalinger',
  'Meta Ads integration',
  'AI Assistent (ClowdBot)',
  'Webhooks & automatisering',
];

export default function SubscriptionPage() {
  const { subscribed, status, trialEndsAt, periodEnd, isLoading, startCheckout, openPortal, checkSubscription } = useSubscription();
  const { t } = useI18n();

  const handleSubscribe = async () => {
    try {
      await startCheckout();
    } catch (e) {
      toast.error((getErrorMessage(e) || 'Kunne ikke starte checkout'));
    }
  };

  const handleManage = async () => {
    try {
      await openPortal();
    } catch (e) {
      toast.error((getErrorMessage(e) || 'Kunne ikke åbne portal'));
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case 'active': return <Badge className="bg-success text-success-foreground">Aktiv</Badge>;
      case 'trialing': return <Badge className="bg-warning text-warning-foreground">Prøveperiode</Badge>;
      case 'past_due': return <Badge variant="destructive">Forfaldent</Badge>;
      case 'canceled': return <Badge variant="secondary">Annulleret</Badge>;
      default: return <Badge variant="outline">Ingen abonnement</Badge>;
    }
  };

  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Abonnement</h1>
        <p className="text-sm text-muted-foreground">Administrer dit abonnement og betalinger</p>
      </div>

      {/* Current Status */}
      <Card className={subscribed ? 'border-primary/30' : ''}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="w-4 h-4 text-primary" />
              Enterprise Plan
            </CardTitle>
            {getStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-bold">499</span>
            <span className="text-muted-foreground">kr / bruger / måned</span>
          </div>

          {status === 'trialing' && trialDaysLeft > 0 && (
            <div className="bg-warning/10 text-warning rounded-lg px-3 py-2 text-sm">
              {trialDaysLeft} dage tilbage af din prøveperiode
            </div>
          )}

          {periodEnd && subscribed && (
            <p className="text-xs text-muted-foreground">
              Næste betaling: {new Date(periodEnd).toLocaleDateString('da-DK')}
            </p>
          )}

          <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {FEATURES.map(f => (
              <li key={f} className="flex items-center gap-2 text-sm">
                <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="text-foreground/80">{f}</span>
              </li>
            ))}
          </ul>

          <div className="flex gap-3 pt-2">
            {subscribed ? (
              <Button onClick={handleManage} variant="outline">
                Administrer abonnement
              </Button>
            ) : (
              <Button onClick={handleSubscribe} disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Start 14-dages gratis prøveperiode
              </Button>
            )}
            <Button variant="ghost" onClick={checkSubscription} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Opdater status'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
