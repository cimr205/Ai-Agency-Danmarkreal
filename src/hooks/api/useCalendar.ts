import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';

export type CalendarEventRow = Database['public']['Tables']['calendar_events']['Row'];
export type CalendarEventInsert = Omit<Database['public']['Tables']['calendar_events']['Insert'], 'company_id' | 'created_by'>;
export type CalendarEventUpdate = Database['public']['Tables']['calendar_events']['Update'];

/** Events that overlap [start, end). Accepts ISO timestamps or dates. */
export function useMyCalendar(params: { start: string; end: string }) {
  return useQuery({
    queryKey: ['calendar', params],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .lt('start_time', params.end)
        .gt('end_time', params.start)
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CalendarEventInsert) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', session.user.id)
        .single();
      if (!profile?.company_id) throw new Error('No company');
      const { data, error } = await supabase
        .from('calendar_events')
        .insert({ ...input, company_id: profile.company_id, created_by: session.user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
  });
}

export function useUpdateCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: CalendarEventUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('calendar_events')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
  });
}

export interface CompanyMember {
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
}

/** People in the caller's company, for picking event attendees. */
export function useCompanyMembers() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  return useQuery({
    queryKey: ['company-members', companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CompanyMember[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, full_name, email, avatar_url')
        .eq('company_id', companyId!)
        .order('full_name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
