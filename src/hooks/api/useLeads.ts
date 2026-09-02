import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fireWebhookEvent } from '@/hooks/api/useWebhooks';
import type { Enums, Json, Tables } from '@/integrations/supabase/types';

export const LEADS_PAGE_SIZE = 100;

export type LeadWithOwner = Tables<'customers'> & { owner: { full_name: string | null; email: string } | null };

export function useLeads(params?: { status?: string; page?: number; search?: string; tags?: string[]; tagLogic?: 'and' | 'or'; industry?: string; folderId?: string | null }) {
  const page = params?.page ?? 0;
  return useQuery({
    queryKey: ['leads', params],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_leads', {
        p_page: page,
        p_page_size: LEADS_PAGE_SIZE,
        p_search: params?.search ?? null,
        p_status: params?.status ?? null,
        p_folder_id: params?.folderId ?? null,
        p_tags: params?.tags ?? null,
        p_tag_logic: params?.tagLogic ?? 'or',
        p_industry: params?.industry ?? null,
      });
      if (error) throw error;
      const result = data as unknown as { items?: LeadWithOwner[]; total_count?: number; page_size?: number };
      return {
        data: result.items ?? [],
        count: result.total_count ?? 0,
        pageSize: result.page_size ?? LEADS_PAGE_SIZE,
      };
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useSavedLeadFilters() {
  return useQuery({
    queryKey: ['saved_lead_filters'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_lead_filters')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateSavedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; filters: Json }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', session.user.id)
        .single();
      if (!profile?.company_id) throw new Error('No company');
      const { data, error } = await supabase
        .from('saved_lead_filters')
        .insert({ ...input, company_id: profile.company_id, user_id: session.user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved_lead_filters'] }),
  });
}

export function useDeleteSavedFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('saved_lead_filters').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved_lead_filters'] }),
  });
}

export function useAllLeadTags() {
  return useQuery({
    queryKey: ['lead_tags_all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('tags').eq('record_type', 'lead');
      if (error) throw error;
      const tagSet = new Set<string>();
      (data ?? []).forEach((r) => {
        if (Array.isArray(r.tags)) r.tags.forEach((t: string) => tagSet.add(t));
      });
      return Array.from(tagSet).sort();
    },
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; email: string; phone?: string; company_name?: string; notes?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', session.user.id)
        .single();
      if (!profile?.company_id) throw new Error('No company');
      const { data, error } = await supabase
        .from('customers')
        .insert({ ...input, company_id: profile.company_id, created_by: session.user.id, record_type: 'lead' })
        .select()
        .single();
      if (error) throw error;
      // Fire webhook
      if (data) fireWebhookEvent(data.company_id, 'lead.created', { lead_id: data.id, name: data.name, email: data.email, company: data.company_name, phone: data.phone, status: data.status });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

// Atomic lead→customer→deal conversion via the convert_lead_to_deal RPC
// (supabase/migrations/20260901000001_atomic_lead_conversion.sql). One
// database transaction: locks the lead, finds-or-creates the customer by
// normalized email/phone (never creates a duplicate contact), creates the
// deal linked by customer_id, marks the lead converted. Idempotent — a
// double-click or a retried request returns the same ids instead of
// creating a second customer or deal. This replaces two previously
// separate, non-atomic client flows (useConvertLeadToCustomer, which never
// created a deal, and LeadDetailPanel's own deal-creation call, which
// never created a customer — a real orphan-deal bug, deals.customer_id
// was always null on that path).
export interface ConvertLeadToDealResult {
  lead_id: string;
  customer_id: string;
  deal_id: string;
  dedupe_result: 'created' | 'matched_existing' | 'already_converted';
}

export function useConvertLeadToDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { leadId: string; dealName: string; value?: number; currency?: string }) => {
      const { data, error } = await supabase.rpc('convert_lead_to_deal', {
        p_lead_id: input.leadId,
        p_deal_name: input.dealName,
        p_value: input.value ?? null,
        p_currency: input.currency ?? 'DKK',
      });
      if (error) throw error;
      return (data as ConvertLeadToDealResult[])[0];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['deals'] });
    },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data: updateData }: { id: string; data: Record<string, unknown> }) => {
      const { data, error } = await supabase
        .from('customers')
        .update(updateData)
        .eq('id', id)
        .eq('record_type', 'lead')
        .select()
        .single();
      if (error) throw error;
      if (data) fireWebhookEvent(data.company_id, 'lead.updated', { lead_id: data.id, name: data.name, email: data.email, status: data.status });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').delete().eq('id', id).eq('record_type', 'lead');
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useUpdateLeadScore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, score }: { id: string; score: number }) => {
      const { data, error } = await supabase
        .from('customers')
        .update({ score })
        .eq('id', id)
        .eq('record_type', 'lead')
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

// ─── Folders ────────────────────────────────────────────────

export function useLeadFolders() {
  return useQuery({
    queryKey: ['lead_folders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_folders')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateLeadFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; color?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', session.user.id)
        .single();
      if (!profile?.company_id) throw new Error('No company');
      const { data, error } = await supabase
        .from('lead_folders')
        .insert({ ...input, company_id: profile.company_id, created_by: session.user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead_folders'] }),
  });
}

export function useUpdateLeadFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data: updateData }: { id: string; data: { name?: string; color?: string } }) => {
      const { data, error } = await supabase
        .from('lead_folders')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead_folders'] }),
  });
}

export function useDeleteLeadFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lead_folders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead_folders'] });
      qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}

export function useBulkUpdateLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, data: updateData }: { ids: string[]; data: Record<string, unknown> }) => {
      const { error } = await supabase
        .from('customers')
        .update(updateData)
        .in('id', ids)
        .eq('record_type', 'lead');
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}

export function useBulkDeleteLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('customers').delete().in('id', ids).eq('record_type', 'lead');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['lead_tags_all'] });
    },
  });
}

export function useMoveLeadToFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ leadId, folderId }: { leadId: string; folderId: string | null }) => {
      const { data, error } = await supabase
        .from('customers')
        .update({ folder_id: folderId })
        .eq('id', leadId)
        .eq('record_type', 'lead')
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}
