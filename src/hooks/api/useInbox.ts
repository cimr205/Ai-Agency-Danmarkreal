import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTeamProfiles } from '@/hooks/api/useTasks';

export interface InboxMessage {
  id: string;
  company_id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read: boolean | null;
  created_at: string;
}

export interface ConversationParticipant {
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  created_at?: string;
}

export interface Conversation {
  participant: ConversationParticipant;
  messages: InboxMessage[];
  lastMessage: InboxMessage;
  unreadCount: number;
  pinned: boolean;
}

/** All messages the current user is party to, company-scoped, newest first. */
export function useMessages() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const userId = profile?.user_id;
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['inbox-messages', companyId, userId],
    enabled: !!companyId && !!userId,
    queryFn: async (): Promise<InboxMessage[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime: any new message or read-state change in this tenant refreshes
  // the thread/list live, same pattern as useAutopilot's workspace events.
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`inbox-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `company_id=eq.${companyId}` },
        () => qc.invalidateQueries({ queryKey: ['inbox-messages', companyId, userId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, userId, qc]);

  return query;
}

const PIN_STORAGE_KEY = 'inbox-pinned-conversations';

function readPinned(): string[] {
  try {
    const raw = localStorage.getItem(PIN_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

/** Pin state has no backend column — persisted client-side only (real effect: reorders the list), not synced across devices. */
export function usePinnedConversations() {
  const [pinned, setPinned] = useState<string[]>(() => readPinned());

  const togglePin = useCallback((otherUserId: string) => {
    setPinned((prev) => {
      const next = prev.includes(otherUserId) ? prev.filter((id) => id !== otherUserId) : [...prev, otherUserId];
      localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { pinned, togglePin };
}

/** Groups the flat message log into one row per colleague, enriched with their profile. */
export function useConversations() {
  const { profile } = useAuth();
  const userId = profile?.user_id;
  const messagesQuery = useMessages();
  const profilesQuery = useTeamProfiles();
  const { pinned, togglePin } = usePinnedConversations();

  const profileMap = useMemo(() => {
    const map = new Map<string, ConversationParticipant>();
    (profilesQuery.data ?? []).forEach((p) => map.set(p.user_id, p));
    return map;
  }, [profilesQuery.data]);

  const conversations = useMemo((): Conversation[] => {
    if (!userId) return [];
    const byParticipant = new Map<string, InboxMessage[]>();
    for (const m of messagesQuery.data ?? []) {
      const otherId = m.sender_id === userId ? m.receiver_id : m.sender_id;
      if (!byParticipant.has(otherId)) byParticipant.set(otherId, []);
      byParticipant.get(otherId)!.push(m);
    }

    const result: Conversation[] = [];
    for (const [otherId, msgs] of byParticipant) {
      const sorted = [...msgs].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const participant = profileMap.get(otherId) ?? { user_id: otherId, full_name: null, email: '', avatar_url: null };
      result.push({
        participant,
        messages: sorted,
        lastMessage: sorted[sorted.length - 1],
        unreadCount: sorted.filter((m) => m.receiver_id === userId && !m.read).length,
        pinned: pinned.includes(otherId),
      });
    }

    result.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.lastMessage.created_at.localeCompare(a.lastMessage.created_at);
    });
    return result;
  }, [messagesQuery.data, profileMap, userId, pinned]);

  return {
    conversations,
    isLoading: messagesQuery.isLoading || profilesQuery.isLoading,
    error: messagesQuery.error,
    togglePin,
    colleagues: profilesQuery.data ?? [],
  };
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { receiver_id: string; content: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', session.user.id)
        .single();
      if (!profile?.company_id) throw new Error('No company');
      const { data, error } = await supabase
        .from('messages')
        .insert({ ...input, company_id: profile.company_id, sender_id: session.user.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox-messages'] }),
  });
}

export function useMarkMessageRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('messages').update({ read: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox-messages'] }),
  });
}

export function useMarkMessageUnread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('messages').update({ read: false }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox-messages'] }),
  });
}

/** Marks every unread message from one colleague as read in a single round trip (opening a thread). */
export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ otherUserId, userId }: { otherUserId: string; userId: string }) => {
      const { error } = await supabase
        .from('messages')
        .update({ read: true })
        .eq('sender_id', otherUserId)
        .eq('receiver_id', userId)
        .eq('read', false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox-messages'] }),
  });
}
