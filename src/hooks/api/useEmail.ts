import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeFunction } from '@/lib/functions';

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
      // Come back to Smart Inbox on this host, in the user's current locale.
      const locale = window.location.pathname.split('/')[1] || 'en';
      const data = await invokeFunction<{ auth_url: string; error?: string }>('gmail-auth', {
        body: { return_url: `${window.location.origin}/${locale}/app/email/emails` },
      });
      if (data?.error) throw new Error(data.error);
      return data;
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
      const data = await invokeFunction<{ synced: number; error?: string }>('gmail-sync', {
        body: { max_results: maxResults || 30 },
      });
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['synced-emails'] });
    },
  });
}

// Get synced emails from database — both inbound (received) and outbound
// (sent via gmail-send) rows, so the inbox can derive Inbox/Sent/Important/
// Starred folders client-side from a single source of truth. `contact` is
// embedded with an explicit FK name because `emails` has two FKs to
// `customers` (customer_id and contact_id) — an unqualified `customers(...)`
// embed is ambiguous and PostgREST 300s on it; contact_id is the one the
// resolver trigger actually writes to.
export function useEmails() {
  return useQuery({
    queryKey: ['synced-emails'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('emails')
        .select('*, contact:customers!emails_contact_id_fkey(id, name, email), deal:deals(id, title)')
        .eq('user_id', user.id)
        .order('received_at', { ascending: false })
        .limit(500);

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
      const data = await invokeFunction<{ error?: string } & Record<string, unknown>>('gmail-send', {
        body: params,
      });
      if (data?.error) throw new Error(data.error);
      return data;
    },
  });
}

// Update email read/star status locally
export function useUpdateEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { is_read?: boolean; is_starred?: boolean; is_important?: boolean } }) => {
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
