import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Leave requests waiting for an approver. Tenant isolation is enforced by RLS. */
export function usePendingLeaveCount() {
  return useQuery({
    queryKey: ['leave-pending-count'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export interface UpcomingLeave {
  id: string;
  name: string;
  type: string;
  start_date: string;
  end_date: string;
  status: string;
}

/** Approved or pending leave that has not ended yet, soonest first. */
export function useUpcomingLeave(limit = 6) {
  return useQuery({
    queryKey: ['leave-upcoming', limit],
    queryFn: async (): Promise<UpcomingLeave[]> => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('leave_requests')
        .select('id, type, start_date, end_date, status, employee_profile_id')
        .gte('end_date', today)
        .neq('status', 'rejected')
        .order('start_date', { ascending: true })
        .limit(limit);
      if (error) throw error;
      const rows = data ?? [];
      const ids = Array.from(new Set(rows.map(r => r.employee_profile_id)));
      const { data: people } = ids.length
        ? await supabase.from('employee_profiles').select('id, full_name').in('id', ids)
        : { data: [] as { id: string; full_name: string }[] };
      const nameById = new Map((people ?? []).map(p => [p.id, p.full_name]));
      return rows.map(r => ({
        id: r.id,
        name: nameById.get(r.employee_profile_id) ?? '—',
        type: String(r.type),
        start_date: r.start_date,
        end_date: r.end_date,
        status: String(r.status),
      }));
    },
  });
}
