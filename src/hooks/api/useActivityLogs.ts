import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface ActivityLog {
  id: string;
  action_type: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  user_id: string;
  company_id: string | null;
}

export function useActivityLogs(limit = 50) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery<ActivityLog[]>({
    queryKey: ['activity_logs', companyId, limit],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as ActivityLog[];
    },
  });
}
