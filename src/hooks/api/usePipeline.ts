import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PipelineLead } from '@/lib/pipeline';
import type { Enums } from '@/integrations/supabase/types';

export function usePipelineLeads(params?: {
  status?: string;
  owner_id?: string;
  min_score?: number;
  max_score?: number;
  min_value?: number;
  max_value?: number;
  q?: string;
}) {
  return useQuery({
    queryKey: ['pipeline-leads', params],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { data: [] as PipelineLead[], total: 0 };
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      if (!profile?.company_id) return { data: [] as PipelineLead[], total: 0 };

      let query = supabase.from('leads').select('*').eq('company_id', profile.company_id);
      if (params?.status) query = query.eq('status', params.status as Enums<'lead_status'>);
      if (params?.owner_id) query = query.eq('owner_id', params.owner_id);
      if (params?.min_score !== undefined) query = query.gte('score', params.min_score);
      if (params?.max_score !== undefined) query = query.lte('score', params.max_score);
      if (params?.min_value !== undefined) query = query.gte('value', params.min_value);
      if (params?.max_value !== undefined) query = query.lte('value', params.max_value);
      if (params?.q) query = query.or(`name.ilike.%${params.q}%,email.ilike.%${params.q}%`);

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      return { data: (data || []) as unknown as PipelineLead[], total: data?.length || 0 };
    },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      const { error } = await supabase.from('leads').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline-leads'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export type LeadAiSummary = {
  summary: string;
  last_contact_summary: string;
  open_promises: string[];
  risk_level: 'low' | 'medium' | 'high';
  risk_reason: string;
  next_action: string;
  days_since_contact: number;
};

export function useLeadAiRecommendation() {
  return useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase.functions.invoke('lead-ai-recommend', {
        body: { lead_id: leadId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as LeadAiSummary;
    },
  });
}

export function usePipelineSellers() {
  return useQuery({
    queryKey: ['pipeline-sellers'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      if (!profile?.company_id) return [];
      const { data } = await supabase.from('profiles').select('user_id, full_name, email').eq('company_id', profile.company_id);
      return (data || []).map(p => ({ id: p.user_id, full_name: p.full_name, email: p.email }));
    },
  });
}
