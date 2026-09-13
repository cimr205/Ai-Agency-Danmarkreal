import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Tables } from '@/integrations/supabase/types';
import { fireWebhookEvent } from '@/hooks/api/useWebhooks';
import { stageWebhookEvent } from '@/lib/deals/wonValidation';

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
    mutationFn: async ({ id, ...updates }: { id: string; notes?: string; expected_close_date?: string | null; title?: string; value?: number; customer_id?: string | null }) => {
      const { data, error } = await supabase
        .from('deals')
        .update(updates)
        .eq('id', id)
        .select(DEAL_CUSTOMER_SELECT)
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

// Stage transitions (in particular deal.won / deal.lost) go through the
// update_deal_stage RPC rather than a raw `.update()`. The RPC is the single
// trusted place a transition happens: it locks the deal row, compares the
// old/new stage server-side, and reports whether a real transition occurred.
// The outbound webhook is only fired when `changed` is true, so re-saving an
// already-won deal (double submit, retry) can never re-fire it. The DB-side
// deal.won -> onboarding pipeline (trg_emit_deal_event -> workspace_events ->
// handle_deal_won_event) is independently idempotent via a unique constraint
// and reacts to the same UPDATE regardless of this webhook.
export function useUpdateDealStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: DealStage }) => {
      const { data, error } = await supabase.rpc('update_deal_stage', { p_deal_id: id, p_stage: stage }).single();
      if (error) throw error;
      const event = stageWebhookEvent(data);
      if (event) fireWebhookEvent(data.company_id, event, { deal_id: data.id, title: data.title, value: data.value });
      return data;
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
