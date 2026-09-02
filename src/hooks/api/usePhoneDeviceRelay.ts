import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json, Tables } from '@/integrations/supabase/types';

export type PhoneDevice = Tables<'phone_devices'>;

export interface PairingSession {
  pairing_session_id: string;
  pairing_secret: string;
  short_code: string;
  expires_at: string;
  qr_payload: {
    version: number;
    session_id: string;
    secret: string;
  };
}

export interface CreateCallCommandInput {
  deviceId: string;
  phoneNumber: string;
  leadId?: string | null;
  displayName?: string | null;
  idempotencyKey: string;
  metadata?: Json;
}

export function usePhoneDevices(enabled = true) {
  return useQuery({
    queryKey: ['phone-devices'],
    enabled,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('phone_devices')
        .select('*')
        .eq('user_id', session.user.id)
        .neq('status', 'revoked')
        .order('last_seen_at', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 5_000,
    staleTime: 2_000,
  });
}

export function useCreatePhonePairingSession() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_phone_pairing_session');
      if (error) throw error;
      return data as unknown as PairingSession;
    },
  });
}

export function useCreatePhoneCallCommand() {
  return useMutation({
    mutationFn: async (input: CreateCallCommandInput) => {
      const { data, error } = await supabase.rpc('create_phone_call_command', {
        p_device_id: input.deviceId,
        p_phone_number: input.phoneNumber,
        p_lead_id: input.leadId ?? null,
        p_display_name: input.displayName ?? null,
        p_idempotency_key: input.idempotencyKey,
        p_metadata: input.metadata ?? {},
      });
      if (error) throw error;
      return data as { command_id: string; status: string; requires_confirmation: boolean; expires_at: string };
    },
  });
}

export function useRevokePhoneDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (deviceId: string) => {
      const { data, error } = await supabase.rpc('revoke_phone_device', { p_device_id: deviceId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['phone-devices'] }),
  });
}
