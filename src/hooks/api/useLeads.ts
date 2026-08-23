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
      const from = page * LEADS_PAGE_SIZE;
      const to = from + LEADS_PAGE_SIZE - 1;

      let query = supabase
        .from('customers')
        .select('*, owner:profiles!customers_owner_id_fkey(full_name, email)', { count: 'exact' })
        .eq('record_type', 'lead')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (params?.status) query = query.eq('status', params.status as Enums<'lead_status'>);
      if (params?.search) {
        query = query.or(`name.ilike.%${params.search}%,email.ilike.%${params.search}%,company_name.ilike.%${params.search}%`);
      }
      if (params?.industry) query = query.eq('industry', params.industry);
      if (params?.tags && params.tags.length > 0) {
        if (params.tagLogic === 'and') {
          query = query.contains('tags', params.tags);
        } else {
          query = query.overlaps('tags', params.tags);
        }
      }
      if (params?.folderId !== undefined) {
        if (params.folderId === null) query = query.is('folder_id', null);
        else query = query.eq('folder_id', params.folderId);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: (data ?? []) as unknown as LeadWithOwner[], count: count ?? 0, pageSize: LEADS_PAGE_SIZE };
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

// Real lead→customer conversion: creates a new customers row
// (record_type='customer') linked back to the source lead via
// converted_from_lead_id, and marks the lead's status so it's visible at a
// glance in the Leads list. The original lead row is never deleted or
// mutated beyond that status flag — its history stays intact.
export function useConvertLeadToCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lead: { id: string; name: string; email: string; phone: string | null; company_name: string | null; address: string | null; city: string | null; company_id: string; created_by: string }) => {
      const { data: customer, error } = await supabase
        .from('customers')
        .insert({
          name: lead.company_name || lead.name,
          email: lead.email,
          phone: lead.phone,
          address: lead.address,
          city: lead.city,
          company_id: lead.company_id,
          created_by: lead.created_by,
          record_type: 'customer',
          converted_from_lead_id: lead.id,
        })
        .select()
        .single();
      if (error) throw error;

      const { error: statusError } = await supabase
        .from('customers')
        .update({ status: 'customer' as Enums<'lead_status'> })
        .eq('id', lead.id)
        .eq('record_type', 'lead');
      if (statusError) throw statusError;

      return customer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
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
