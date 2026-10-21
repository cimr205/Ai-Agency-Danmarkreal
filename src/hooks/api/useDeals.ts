import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Tables } from '@/integrations/supabase/types';

type DealStage = string;

export type DealWithCustomer = Tables<'deals'> & {
  customers: Pick<Tables<'customers'>, 'name' | 'lead_source' | 'email'> | null;
};

const DEAL_CUSTOMER_SELECT = "*, customers!deals_customer_id_fkey(name, lead_source, email)";

export function useDeals() {
  return useQuery({
    queryKey: ['deals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select(DEAL_CUSTOMER_SELECT)
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
      const { stage, ...fieldUpdates } = updates;
      if (stage) {
        const { error: transitionError } = await supabase.rpc('transition_deal_stage', {
          p_deal_id: id,
          p_target_stage: stage,
        });
        if (transitionError) throw transitionError;
      }
      if (Object.keys(fieldUpdates).length) {
        const { error: updateError } = await supabase.from('deals').update(fieldUpdates).eq('id', id);
        if (updateError) throw updateError;
      }
      const { data, error } = await supabase
        .from('deals')
        .select(DEAL_CUSTOMER_SELECT)
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as unknown as DealWithCustomer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['pipeline-summary'] });
    },
  });
}

export function useUpdateDealStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: DealStage }) => {
      const { data, error } = await supabase.rpc('transition_deal_stage', { p_deal_id: id, p_target_stage: stage });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['pipeline-summary'] });
    },
  });
}

export function useBulkUpdateDealStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, stage }: { ids: string[]; stage: DealStage }) => {
      const results = await Promise.all(
        ids.map((id) => supabase.rpc('transition_deal_stage', { p_deal_id: id, p_target_stage: stage })),
      );
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;
      return results.map((r) => r.data);
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
