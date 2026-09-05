import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useMyCalendar(params: { start: string; end: string }) {
  return useQuery({
    queryKey: ['calendar', params],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .gte('start_time', params.start)
        .lte('end_time', params.end)
        .order('start_time', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export interface ExternalPushResult {
  pushed: boolean;
  provider?: string;
  reason?: string;
  externalId?: string | null;
  externalUrl?: string | null;
}

export function useCreateCalendarEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string; description?: string; start_time: string; end_time: string; event_type?: string; related_type?: 'lead' | 'customer' | 'deal'; related_id?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', session.user.id)
        .single();
      if (!profile?.company_id) throw new Error('No company');
      const { data, error } = await supabase
        .from('calendar_events')
        .insert({ ...input, company_id: profile.company_id, created_by: session.user.id })
        .select()
        .single();
      if (error) throw error;

      // Best-effort push to a connected external calendar (calendar.write).
      // The native row above is the real, durable record regardless of
      // whether this succeeds — never rolled back for an external-push
      // failure — but the caller gets the honest outcome to show, never a
      // silent "synced" claim that didn't actually happen.
      let externalPush: ExternalPushResult = { pushed: false, reason: 'not_attempted' };
      try {
        const { data: pushResult, error: pushError } = await supabase.functions.invoke('composio-integration', {
          body: {
            action: 'create-event',
            title: input.title,
            description: input.description,
            startTime: input.start_time,
            endTime: input.end_time,
          },
        });
        if (pushError) throw pushError;
        externalPush = (pushResult as ExternalPushResult) ?? { pushed: false, reason: 'unknown' };
      } catch (e) {
        // supabase-js's FunctionsHttpError.message is a generic "non-2xx
        // status code" — the real Composio/tool error is in the response
        // body (e.context is the raw Response). Read it here so a failure
        // is actually diagnosable instead of surfacing as "push_failed".
        let reason = e instanceof Error ? e.message : 'push_failed';
        const context = (e as { context?: Response })?.context;
        if (context && typeof context.json === 'function') {
          try {
            const body = await context.clone().json();
            if (body?.error) reason = body.error;
          } catch { /* body wasn't JSON — keep the generic message */ }
        }
        console.error('[Calendar] external push failed:', reason);
        externalPush = { pushed: false, reason };
      }

      return { ...data, externalPush };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar'] }),
  });
}
