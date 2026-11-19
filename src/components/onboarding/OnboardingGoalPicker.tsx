import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Target, Users, Megaphone, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isLocale, useI18n } from '@/lib/i18n';

type Goal = 'crm' | 'hr' | 'marketing';

const GOALS: { goal: Goal; icon: typeof Target; dashboardPath: string }[] = [
  { goal: 'crm', icon: Target, dashboardPath: 'crm/dashboard' },
  { goal: 'hr', icon: Users, dashboardPath: 'hr/dashboard' },
  { goal: 'marketing', icon: Megaphone, dashboardPath: 'marketing/dashboard' },
];

/**
 * Shown once, right after a user's company/subscription is set up, so the
 * app can route them to a relevant starting point instead of showing every
 * module at once. Reads/writes profiles.onboarding_goal.
 */
export function OnboardingGoalPicker({ onDone }: { onDone: () => void }) {
  const { user, refreshProfile } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';

  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState<Goal | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    supabase
      .from('profiles')
      .select('onboarding_goal')
      .eq('user_id', user.user_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error) return;
        if (!data?.onboarding_goal) setVisible(true);
      });
    return () => { cancelled = true; };
  }, [user]);

  if (!visible) return null;

  const choose = async (goal: Goal) => {
    setSaving(goal);
    try {
      await supabase.from('profiles').update({ onboarding_goal: goal }).eq('user_id', user!.user_id);
      await refreshProfile();
    } catch {
      // Non-fatal — still route them to the relevant dashboard even if
      // persisting the preference failed; they can pick again next time.
    } finally {
      setVisible(false);
      onDone();
      const target = GOALS.find(g => g.goal === goal)!;
      navigate(`/${locale}/app/${target.dashboardPath}`);
    }
  };

  const skip = () => { setVisible(false); onDone(); };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl relative">
        <Button variant="ghost" size="icon" className="absolute right-3 top-3 h-7 w-7" onClick={skip} aria-label={t('goalPicker.skip')}>
          <X className="h-4 w-4" />
        </Button>
        <CardHeader>
          <CardTitle>{t('goalPicker.title')}</CardTitle>
          <CardDescription>{t('goalPicker.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          {GOALS.map(({ goal, icon: Icon }) => (
            <button
              key={goal}
              onClick={() => choose(goal)}
              disabled={saving !== null}
              className="text-left rounded-xl border p-4 space-y-2 hover:border-primary hover:bg-muted/40 transition-colors disabled:opacity-50"
            >
              <Icon className="h-5 w-5 text-primary" />
              <div className="font-medium text-sm">{t(`goalPicker.${goal}Title`)}</div>
              <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>{t(`goalPicker.${goal}Point1`)}</li>
                <li>{t(`goalPicker.${goal}Point2`)}</li>
                <li>{t(`goalPicker.${goal}Point3`)}</li>
              </ul>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
