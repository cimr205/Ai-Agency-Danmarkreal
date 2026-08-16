import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Gmail connection status
export function useGmailAccount() {
  return useQuery({
    queryKey: ['gmail-account'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('email_accounts')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'gmail')
        .eq('status', 'connected')
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });
}

// Connect Gmail - get OAuth URL
export function useConnectGmail() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('gmail-auth');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { auth_url: string };
    },
  });
}

// Disconnect Gmail
export function useDisconnectGmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('email_accounts')
        .update({ status: 'disconnected' })
        .eq('user_id', user.id)
        .eq('provider', 'gmail');

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gmail-account'] });
      qc.invalidateQueries({ queryKey: ['synced-emails'] });
    },
  });
}

// Sync emails from Gmail
export function useSyncEmails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (maxResults?: number) => {
      const { data, error } = await supabase.functions.invoke('gmail-sync', {
        body: { max_results: maxResults || 30 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { synced: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['synced-emails'] });
    },
  });
}

// Get synced emails from database
export function useEmails(filter?: { unread?: boolean; priority?: boolean; starred?: boolean }) {
  return useQuery({
    queryKey: ['synced-emails', filter],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      let query = supabase
        .from('emails')
        .select('*')
        .eq('user_id', user.id)
        .order('received_at', { ascending: false })
        .limit(500);

      if (filter?.unread) query = query.eq('is_read', false);
      if (filter?.starred) query = query.eq('is_starred', true);
      if (filter?.priority) query = query.not('ai_priority', 'is', null);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 15000,
  });
}

// Send email via Gmail
export function useSendEmail() {
  return useMutation({
    mutationFn: async (params: { to: string; subject: string; message: string; cc?: string; reply_to_message_id?: string }) => {
      const { data, error } = await supabase.functions.invoke('gmail-send', {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
  });
}

// Update email read/star status locally
export function useUpdateEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { is_read?: boolean; is_starred?: boolean } }) => {
      const { error } = await supabase
        .from('emails')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['synced-emails'] });
    },
  });
}

// Legacy exports for backward compatibility
export function useEmailOAuthCallback() {
  return useMutation({ mutationFn: async (_data: { code: string; state: string }) => ({}) });
}

export function useTodos() {
  return useQuery({ queryKey: ['todos'], queryFn: async () => [] });
}

export function useMarkTodoComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_id: string) => ({}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['todos'] }),
  });
}

export function useCampaigns() {
  return useQuery({ queryKey: ['campaigns'], queryFn: async () => [] });
}

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_data: { name: string; subject: string; body: string; recipients: string[] }) => ({}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}

export function useSendCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (_id: string) => ({}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['campaigns'] }),
  });
}
