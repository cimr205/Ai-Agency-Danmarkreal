import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Enums } from '@/integrations/supabase/types';

const PAGE_SIZE = 50;

interface LeadFilters {
  status?: string;
  search?: string;
  tags?: string[];
  tagLogic?: 'and' | 'or';
  industry?: string;
}

export function useLeadsPaginated(filters?: LeadFilters) {
  return useInfiniteQuery({
    queryKey: ['leads-paginated', filters],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (filters?.status) query = query.eq('status', filters.status as Enums<'lead_status'>);
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,company_name.ilike.%${filters.search}%`);
      }
      if (filters?.industry) query = query.eq('industry', filters.industry);
      if (filters?.tags && filters.tags.length > 0) {
        if (filters.tagLogic === 'and') {
          query = query.contains('tags', filters.tags);
        } else {
          query = query.overlaps('tags', filters.tags);
        }
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0, nextOffset: pageParam + PAGE_SIZE };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.data.length < PAGE_SIZE) return undefined;
      return lastPage.nextOffset;
    },
  });
}

export function useEmailsPaginated(filter?: { unread?: boolean; priority?: boolean; starred?: boolean }) {
  return useInfiniteQuery({
    queryKey: ['emails-paginated', filter],
    queryFn: async ({ pageParam = 0 }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { data: [], count: 0, nextOffset: 0 };

      let query = supabase
        .from('emails')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('received_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);

      if (filter?.unread) query = query.eq('is_read', false);
      if (filter?.starred) query = query.eq('is_starred', true);
      if (filter?.priority) query = query.not('ai_priority', 'is', null);

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0, nextOffset: pageParam + PAGE_SIZE };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (lastPage.data.length < PAGE_SIZE) return undefined;
      return lastPage.nextOffset;
    },
  });
}
