import { useEffect, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useI18n } from '@/lib/i18n';
import { logProductEvent } from '@/lib/productEvents';

interface ChecklistItem {
  key: string;
  done: boolean;
  required: boolean;
}

/**
 * Every item here reflects real, independently-verifiable state — never a
 * flag that gets set to "done" just because a button was clicked. If the
 * underlying action didn't actually succeed (e.g. an invite insert failed),
 * the corresponding item stays unchecked, and survives refresh/logout/
 * login because it's recomputed from the database every time, not cached.
 */
export function OnboardingChecklist() {
  const { user } = useAuth();
  const { subscribed } = useSubscription();
  const { t } = useI18n();
  const [hasInvitedSomeone, setHasInvitedSomeone] = useState<boolean | null>(null);
  const [hasIntegration, setHasIntegration] = useState<boolean | null>(null);
  const [hasCompletedTask, setHasCompletedTask] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user?.company_id) return;
    let cancelled = false;

    supabase.from('invitations').select('id', { count: 'exact', head: true })
      .then(({ count }) => { if (!cancelled) setHasInvitedSomeone((count ?? 0) > 0); });

    supabase.from('integrations').select('id', { count: 'exact', head: true }).eq('status', 'connected')
      .then(({ count }) => { if (!cancelled) setHasIntegration((count ?? 0) > 0); });

    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'completed')
      .then(({ count }) => { if (!cancelled) setHasCompletedTask((count ?? 0) > 0); });

    return () => { cancelled = true; };
  }, [user?.company_id]);

  const items: ChecklistItem[] = [
    { key: 'accountCreated', done: !!user, required: true },
    { key: 'companyCreated', done: !!user?.company_id, required: true },
    { key: 'subscriptionActivated', done: subscribed, required: true },
    { key: 'firstEmployeeInvited', done: hasInvitedSomeone === true, required: false },
    { key: 'firstIntegrationConnected', done: hasIntegration === true, required: false },
    { key: 'firstTaskCompleted', done: hasCompletedTask === true, required: false },
  ];

  const requiredDone = items.filter(i => i.required).every(i => i.done);

  useEffect(() => {
    if (requiredDone && user?.company_id) logProductEvent('onboarding_completed', user.company_id);
    // Best-effort, fire-and-forget; duplicates across renders are harmless
    // (not deduped server-side for this one — see docs for why).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredDone]);

  if (requiredDone) return null;

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 p-4 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('onboardingChecklist.title')}</p>
      <ul className="space-y-1.5">
        {items.map(item => (
          <li key={item.key} className="flex items-center gap-2 text-sm">
            {item.done ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
            )}
            <span className={item.done ? 'text-muted-foreground line-through' : ''}>
              {t(`onboardingChecklist.${item.key}`)}
            </span>
            {!item.required && <span className="text-[10px] text-muted-foreground/60">{t('onboardingChecklist.optional')}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
