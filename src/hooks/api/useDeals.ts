import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Tables } from '@/integrations/supabase/types';
import { fireWebhookEvent } from '@/hooks/api/useWebhooks';

type DealStage = string;

export type DealWithCustomer = Tables<'deals'> & { customers: Pick<Tables<'customers'>, 'name' | 'email'> | null };

export function useDeals() {
  return useQuery({
    queryKey: ['deals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('*, customers!deals_customer_id_fkey(name, email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as DealWithCustomer[];
    },
  });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; value: number; stage?: DealStage; customer_id?: string; expected_close_date?: string; notes?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', session.user.id)
        .single();
      if (!profile?.company_id) throw new Error('No company');
      const { data, error } = await supabase
        .from('deals')
        .insert({ ...input, company_id: profile.company_id, created_by: session.user.id })
        .select()
        .single();
      if (error) throw error;
      if (data) fireWebhookEvent(data.company_id, 'deal.created', { deal_id: data.id, title: data.title, value: data.value, stage: data.stage });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['pipeline-summary'] });
    },
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; stage?: DealStage; notes?: string; expected_close_date?: string | null; title?: string; value?: number; customer_id?: string | null }) => {
      const { data, error } = await supabase
        .from('deals')
        .update(updates)
        .eq('id', id)
        .select('*, customers!deals_customer_id_fkey(name, email)')
        .single();
      if (error) throw error;
      // Fire deal.won or deal.lost events
      if (data && updates.stage === 'won') fireWebhookEvent(data.company_id, 'deal.won', { deal_id: data.id, title: data.title, value: data.value });
      if (data && updates.stage === 'lost') fireWebhookEvent(data.company_id, 'deal.lost', { deal_id: data.id, title: data.title, value: data.value });
      return data as unknown as DealWithCustomer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['pipeline-summary'] });
    },
  });
}

export function usePipelineSummary() {
  return useQuery({
    queryKey: ['pipeline-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('stage, value');
      if (error) throw error;
      const stages: Record<string, { count: number; value: number }> = {};
      (data ?? []).forEach(d => {
        if (!stages[d.stage]) stages[d.stage] = { count: 0, value: 0 };
        stages[d.stage].count++;
        stages[d.stage].value += Number(d.value || 0);
      });
      return stages;
    },
  });
}
