import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fireWebhookEvent } from '@/hooks/api/useWebhooks';

export function useTasks(opts: { archived?: boolean } = {}) {
  const archived = opts.archived ?? false;
  return useQuery({
    queryKey: ['tasks', { archived }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(full_name, email)')
        .eq('archived', archived)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });
}

export function useTeamProfiles() {
  return useQuery({
    queryKey: ['team-profiles'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return [];
      const { data: profile } = await supabase.from('profiles').select('company_id').eq('user_id', session.user.id).single();
      if (!profile?.company_id) return [];
      const { data, error } = await supabase.from('profiles').select('user_id, full_name, email').eq('company_id', profile.company_id);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; description?: string; due_date?: string; priority?: string; assigned_to?: string; lead_id?: string; deal_id?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', session.user.id)
        .single();
      if (!profile?.company_id) throw new Error('No company');
      const { data, error } = await supabase
        .from('tasks')
        .insert({ ...input, company_id: profile.company_id, created_by: session.user.id })
        .select()
        .single();
      if (error) throw error;
      if (data) fireWebhookEvent(data.company_id, 'task.created', { task_id: data.id, title: data.title, priority: data.priority, due_date: data.due_date });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data: updateData }: { id: string; data: Record<string, unknown> }) => {
      const { data, error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      if (data && updateData.status === 'completed') fireWebhookEvent(data.company_id, 'task.completed', { task_id: data.id, title: data.title });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useBulkUpdateTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, data: updateData }: { ids: string[]; data: Record<string, unknown> }) => {
      const { error } = await supabase.from('tasks').update(updateData).in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useBulkDeleteTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from('tasks').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
