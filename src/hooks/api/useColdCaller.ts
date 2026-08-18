import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";

export interface TwilioPhoneNumber {
  sid: string;
  phone_number: string;
  friendly_name?: string;
  capabilities?: { voice?: boolean; sms?: boolean; mms?: boolean };
}

export interface TwilioAccountInfo {
  connected: boolean;
  authRequired?: boolean;
  degraded?: boolean;
  fallback?: boolean;
  error?: string;
  balance?: number;
  balance_currency?: string;
  usage?: { count: number; price: string; usage_minutes: number };
  phoneNumbers?: TwilioPhoneNumber[];
  noPhoneNumbers?: boolean;
  account?: { sid: string; friendly_name: string; status: string; type: string };
}

export type ColdCallerUsageRecord = Tables<'cold_caller_usage'>;

export interface NumberSearchResult {
  phone_number: string;
  friendly_name?: string;
  locality?: string;
  region?: string;
  iso_country?: string;
  capabilities?: unknown;
  price?: string | null;
}

export interface NumberSearchResponse {
  numbers: NumberSearchResult[];
  usedType?: string;
  warning?: string;
}

async function callColdCaller<T = unknown>(
  action: string,
  body: Record<string, unknown> = {},
  options: { allowFallback?: boolean } = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("cold-caller", {
    body: { action, ...body },
  });

  if (error) {
    let parsedBody: { error?: string; fallback?: boolean } | null = null;
    const ctx = (error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } }).context;

    try {
      if (ctx?.json) {
        parsedBody = await ctx.json() as { error?: string; fallback?: boolean };
      } else if (ctx?.text) {
        const text = await ctx.text();
        parsedBody = text ? JSON.parse(text) : null;
      }
    } catch {
      parsedBody = null;
    }

    if (parsedBody?.fallback && options.allowFallback) {
      return parsedBody as T;
    }

    throw new Error(parsedBody?.error || error.message);
  }

  if (data?.error && !(options.allowFallback && data?.fallback)) {
    throw new Error(data.error);
  }

  return data as T;
}

export function useTwilioAccount() {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["twilio-account"],
    queryFn: () => callColdCaller<TwilioAccountInfo>("account-info", {}, { allowFallback: true }),
    staleTime: 60_000,
    retry: 1,
    enabled: isAuthenticated && !isLoading,
  });
}

export function useSaveTwilioCredentials() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { accountSid: string; authToken: string }) =>
      callColdCaller("save-credentials", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["twilio-account"] });
    },
  });
}

export function useConnectDefaultTwilio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callColdCaller("connect-default"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["twilio-account"] });
    },
  });
}

export function useDisconnectTwilio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callColdCaller("disconnect"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["twilio-account"] });
    },
  });
}

export function useColdCallerUsage() {
  const { isAuthenticated, isLoading } = useAuth();
  return useQuery({
    queryKey: ["cold-caller-usage"],
    queryFn: () => callColdCaller<ColdCallerUsageRecord[]>("usage-history"),
    staleTime: 30_000,
    enabled: isAuthenticated && !isLoading,
  });
}

export function useStartSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callColdCaller<Tables<'cold_caller_usage'>>("start-session"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cold-caller-usage"] }),
  });
}

export function useEndSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { sessionId: string; calls_made: number; leads_created: number; duration_seconds: number }) =>
      callColdCaller("end-session", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cold-caller-usage"] }),
  });
}

export function useMakeCall() {
  return useMutation({
    mutationFn: (payload: { to: string; from: string; leadId?: string; leadName?: string }) =>
      callColdCaller("make-call", payload),
  });
}

export function useSearchNumbers() {
  return useMutation({
    mutationFn: (payload: { country?: string; areaCode?: string; contains?: string; numberType?: string }) =>
      callColdCaller<NumberSearchResponse>("search-numbers", payload),
  });
}

export function useBuyNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { phoneNumber: string; country?: string }) =>
      callColdCaller("buy-number", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["twilio-account"] });
    },
  });
}

export function useReleaseNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { numberSid: string }) =>
      callColdCaller("release-number", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["twilio-account"] });
    },
  });
}
