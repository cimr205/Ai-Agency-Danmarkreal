import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type FollowUpItem = {
  id: string;
  name: string;
  company_name: string | null;
  status: string;
  score: number | null;
  value: number | null;
  days_since_contact: number;
  overdue: boolean;
  priority: number;
  reason: string;
};

/**
 * "Who should I talk to today" — prioritizes leads by inactivity, overdue
 * follow-ups, and deal size instead of requiring a manual scan of hundreds
 * of contacts.
 */
export function useFollowUpFeed(limit = 6) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['followup-feed', profile?.company_id],
    enabled: !!profile?.company_id,
    staleTime: 60_000,
    queryFn: async (): Promise<FollowUpItem[]> => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, company_name, status, score, value, last_touched_at, next_followup_at, created_at')
        .eq('company_id', profile!.company_id)
        .not('status', 'in', '(customer,unqualified)')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;

      const now = Date.now();
      const items: FollowUpItem[] = (data ?? []).map((lead) => {
        const anchor = lead.last_touched_at || lead.created_at;
        const daysSinceContact = Math.max(0, Math.floor((now - new Date(anchor).getTime()) / (1000 * 60 * 60 * 24)));
        const overdue = !!lead.next_followup_at && new Date(lead.next_followup_at).getTime() < now;

        const inactivityScore = Math.min(daysSinceContact, 30) * 2;
        const valueScore = lead.value ? Math.min(Number(lead.value) / 5000, 30) : 0;
        const leadScore = (lead.score ?? 0) * 1.5;
        const overdueBoost = overdue ? 40 : 0;
        const priority = inactivityScore + valueScore + leadScore + overdueBoost;

        const reason = overdue
          ? 'Opfølgning overskredet'
          : daysSinceContact >= 14
          ? `${daysSinceContact} dage uden kontakt`
          : lead.value && Number(lead.value) >= 50000
          ? 'Høj dealværdi'
          : `${daysSinceContact} dage uden kontakt`;

        return {
          id: lead.id,
          name: lead.name,
          company_name: lead.company_name,
          status: lead.status,
          score: lead.score,
          value: lead.value,
          days_since_contact: daysSinceContact,
          overdue,
          priority,
          reason,
        };
      });

      return items.sort((a, b) => b.priority - a.priority).slice(0, limit);
    },
  });
}
