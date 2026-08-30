import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export interface VoicePhoneNumber {
  sid: string;
  phone_number: string;
  friendly_name?: string;
  capabilities?: { voice?: boolean; sms?: boolean; mms?: boolean };
}

export interface VoiceTelephonyAccountInfo {
  connected: boolean;
  authRequired?: boolean;
  degraded?: boolean;
  fallback?: boolean;
  error?: string;
  balance?: number;
  balance_currency?: string;
  usage?: { count: number; price: string; usage_minutes: number };
  phoneNumbers?: VoicePhoneNumber[];
  noPhoneNumbers?: boolean;
  account?: { sid: string; friendly_name: string; status: string; type: string };
}

async function callVoiceTelephony<T>(
  action: "account-info" | "connect-default",
  options: { allowFallback?: boolean } = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("voice-telephony", {
    body: { action },
  });

  if (error) {
    let parsedBody: { error?: string; fallback?: boolean } | null = null;
    const context = (error as {
      context?: { json?: () => Promise<unknown>; text?: () => Promise<string> };
    }).context;

    try {
      if (context?.json) {
        parsedBody = (await context.json()) as { error?: string; fallback?: boolean };
      } else if (context?.text) {
        const text = await context.text();
        parsedBody = text ? JSON.parse(text) : null;
      }
    } catch {
      parsedBody = null;
    }

    if (parsedBody?.fallback && options.allowFallback) return parsedBody as T;
    throw new Error(parsedBody?.error || error.message);
  }

  if (data?.error && !(options.allowFallback && data.fallback)) {
    throw new Error(data.error);
  }

  return data as T;
}

export function useVoiceTelephonyAccount() {
  const { isAuthenticated, isLoading } = useAuth();

  return useQuery({
    queryKey: ["voice-telephony-account"],
    queryFn: () =>
      callVoiceTelephony<VoiceTelephonyAccountInfo>("account-info", {
        allowFallback: true,
      }),
    staleTime: 60_000,
    retry: 1,
    enabled: isAuthenticated && !isLoading,
  });
}

export function useConnectVoiceTelephony() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => callVoiceTelephony("connect-default"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voice-telephony-account"] });
    },
  });
}
