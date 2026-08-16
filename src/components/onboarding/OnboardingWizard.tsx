/**
 * Onboarding Wizard - Simple: just company name + user name, no Stripe
 */

import { useState } from 'react';
import { Building2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/lib/i18n';

interface OnboardingWizardProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { toast } = useToast();
  const { user, refreshProfile } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [fullName, setFullName] = useState(user?.full_name || '');

  const handleSubmit = async () => {
    if (!companyName.trim()) {
      toast({ variant: 'destructive', title: t('wizard.fillCompanyName') });
      return;
    }
    if (!fullName.trim()) {
      toast({ variant: 'destructive', title: t('wizard.fillName') });
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const companyId = crypto.randomUUID();

      const { error: companyError } = await supabase
        .from('companies')
        .insert({
          id: companyId,
          name: companyName,
          onboarding_completed: true,
          subscription_status: 'none',
        });

      if (companyError) throw new Error(companyError.message);

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          company_id: companyId,
          full_name: fullName,
          onboarding_completed: true,
        })
        .eq('user_id', user.user_id);

      if (profileError) throw new Error(profileError.message);

      const { error: roleError } = await supabase
        .from('user_roles')
        .upsert({ user_id: user.user_id, role: 'company_admin' }, { onConflict: 'user_id,role' });

      if (roleError) throw new Error(roleError.message);

      await refreshProfile();

      // Forward straight to Stripe Checkout — no free entry.
      toast({ title: t('wizard.welcome'), description: t('wizard.companyCreatedFallback').replace('{company}', companyName) });

      const localeMatch = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/);
      const locale = localeMatch?.[1] ?? 'da';
      const currency = locale === 'en' ? 'usd' : 'dkk';
      const { data: checkout, error: checkoutError } = await supabase.functions.invoke('create-checkout', {
        body: { seat_limit: 1, currency, locale },
      });
      if (checkoutError || !checkout?.url) {
        throw new Error(checkoutError?.message || 'Could not start checkout');
      }
      // Same-tab redirect so the user lands back in the app after payment.
      window.location.href = checkout.url;
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('wizard.errorTitle'),
        description: err instanceof Error ? err.message : t('wizard.errorDesc'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">{t('wizard.companyTitle')}</CardTitle>
            </div>
          </div>
          <CardDescription>{t('wizard.companyDesc')}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full-name">{t('auth.fullName')} *</Label>
            <Input
              id="full-name"
              placeholder="John Doe"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-name">{t('wizard.companyNameLabel')}</Label>
            <Input
              id="company-name"
              placeholder={t('wizard.companyNamePlaceholder')}
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
            />
          </div>

          <Button onClick={handleSubmit} disabled={loading} className="w-full mt-4">
            {loading ? t('wizard.creating') : (
              <><Check className="w-4 h-4 mr-2" /> {t('wizard.startTrial')}</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
