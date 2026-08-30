import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import type { DevicePlatform, DialHandoffMethod } from '@/lib/deviceDialer';

export type CallOutcome = 'no_answer' | 'callback' | 'interested' | 'not_interested';
export type PowerDialerCall = Tables<'power_dialer_calls'> & {
  lead: Pick<Tables<'customers'>, 'id' | 'name' | 'company_name' | 'phone'> | null;
};

export interface LogPowerDialerCallInput {
  leadId: string;
  phoneNumber: string;
  outcome: CallOutcome;
  notes: string;
  callbackAt: string | null;
  durationSeconds: number;
  platform: DevicePlatform;
  handoffMethod: DialHandoffMethod;
}

export function usePowerDialerCalls(limit = 50) {
  return useQuery({
    queryKey: ['power-dialer-calls', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('power_dialer_calls')
        .select('*, lead:customers!power_dialer_calls_lead_id_fkey(id, name, company_name, phone)')
        .order('dialed_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as unknown as PowerDialerCall[];
    },
    staleTime: 30_000,
  });
}

export function useLogPowerDialerCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: LogPowerDialerCallInput) => {
      const { data, error } = await supabase.rpc('log_power_dialer_call', {
        _callback_at: input.callbackAt,
        _duration_seconds: input.durationSeconds,
        _handoff_method: input.handoffMethod,
        _lead_id: input.leadId,
        _notes: input.notes,
        _outcome: input.outcome,
        _phone_number: input.phoneNumber,
        _platform: input.platform,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['power-dialer-calls'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
