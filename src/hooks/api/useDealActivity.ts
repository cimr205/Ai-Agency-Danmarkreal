import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Backs the "coherent story" requirement on the deal detail view: source →
// contact → emails → tasks → onboarding, without opening five separate
// pages. Deliberately three small parallel queries rather than one clever
// join — tasks/emails/onboarding_runs have no natural single join key
// together, and each is cheap/indexed on deal_id already.
export function useDealActivity(dealId: string | undefined) {
  return useQuery({
    queryKey: ['deal-activity', dealId],
    enabled: !!dealId,
    queryFn: async () => {
      const [tasksRes, emailsRes, onboardingRes] = await Promise.all([
        supabase.from('tasks').select('id, title, status, due_date').eq('deal_id', dealId!).order('created_at', { ascending: false }).limit(5),
        supabase.from('emails').select('id, subject, from_address, direction, received_at').eq('deal_id', dealId!).order('received_at', { ascending: false }).limit(5),
        supabase.from('onboarding_runs').select('id, status, started_at, completed_at').eq('deal_id', dealId!).maybeSingle(),
      ]);
      return {
        tasks: tasksRes.data ?? [],
        emails: emailsRes.data ?? [],
        onboarding: onboardingRes.data ?? null,
      };
    },
  });
}
