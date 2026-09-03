import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type CrmActivity = Tables<'crm_activities'>;
export type CrmActivityType = CrmActivity['type'];

export function useActivities(entityType: 'customer' | 'deal', entityId: string | undefined) {
  return useQuery({
    queryKey: ['crm-activities', entityType, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_activities')
        .select('*, author:profiles!crm_activities_created_by_fkey(full_name, email)')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      entity_type: 'customer' | 'deal';
      entity_id: string;
      type: CrmActivityType;
      body?: string;
      next_step_at?: string;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', session.user.id)
        .single();
      if (!profile?.company_id) throw new Error('No company');
      const { data, error } = await supabase
        .from('crm_activities')
        .insert({ ...input, company_id: profile.company_id, created_by: session.user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['crm-activities', data.entity_type, data.entity_id] });
      qc.invalidateQueries({ queryKey: ['client-graph', data.entity_id] });
      qc.invalidateQueries({ queryKey: ['followups-today'] });
    },
  });
}

export function useCompleteFollowup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('crm_activities')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['crm-activities', data.entity_type, data.entity_id] });
      qc.invalidateQueries({ queryKey: ['followups-today'] });
    },
  });
}

export function useFollowupsToday() {
  return useQuery({
    queryKey: ['followups-today'],
    queryFn: async () => {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const { data, error } = await supabase
        .from('crm_activities')
        .select('*, author:profiles!crm_activities_created_by_fkey(full_name, email)')
        .is('completed_at', null)
        .not('next_step_at', 'is', null)
        .lte('next_step_at', endOfToday.toISOString())
        .order('next_step_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}
