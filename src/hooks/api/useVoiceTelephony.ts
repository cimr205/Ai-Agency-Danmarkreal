import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { AppError, invokeFunction } from "@/lib/functions";

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
  try {
    const data = await invokeFunction<T & { error?: string; fallback?: boolean }>("voice-telephony", {
      body: { action },
    });
    if (data?.error && !(options.allowFallback && data.fallback)) {
      throw new Error(data.error);
    }
    return data;
  } catch (err) {
    // A degraded/fallback response arrives as a non-2xx body with
    // `fallback: true` — treat it as data, not a failure, when the caller
    // opted in.
    if (err instanceof AppError && options.allowFallback && err.body?.fallback) {
      return err.body as T;
    }
    throw err;
  }
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
