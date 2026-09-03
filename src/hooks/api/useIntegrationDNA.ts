import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// All traffic goes through the integration-intelligence edge function —
// same call pattern as useIntegrations.ts's callComposioIntegration.
async function callIntegrationIntelligence<T = unknown>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("integration-intelligence", { body: { action, ...body } });
  if (error) {
    const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
    let message = error.message;
    try {
      const parsed = (await ctx?.json?.()) as { error?: string } | undefined;
      if (parsed?.error) message = parsed.error;
    } catch {
      // ignore, fall back to error.message
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export interface IntegrationDNA {
  company_id: string;
  score: number;
  connected_count: number;
  capability_count: number;
  used_capability_count: number;
  unused_capability_count: number;
  ready_opportunity_count: number;
  broken_chain_count: number;
  needs_attention_count: number;
  computed_at: string;
}

export interface IntegrationOpportunity {
  id: string;
  company_id: string;
  type: "READY_NOW" | "ONE_CONNECTION_AWAY" | "UNUSED_CAPABILITY" | "CROSS_MODULE" | "WORKFLOW_COMBINATION" | "REDUNDANCY" | "BROKEN_CHAIN";
  title: string;
  description: string;
  reason: string;
  confidence: number;
  status: "open" | "dismissed" | "activated";
  required_capabilities: string[];
  missing_capabilities: string[];
  impacted_modules: string[];
  estimated_manual_steps_removed: number;
  created_at: string;
}

// Fetches the cached DNA snapshot, recalculating first — cheap (indexed
// queries only, no external calls), safe to run on every Integration
// Centre page load so the score never goes stale while the user's on the
// page.
export function useIntegrationDNA() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["integration-dna", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: () => callIntegrationIntelligence<{ dna: IntegrationDNA }>("recalculate").then((r) => r.dna),
    staleTime: 60_000,
  });
}

export function useIntegrationOpportunities() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["integration-opportunities", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: () => callIntegrationIntelligence<{ opportunities: IntegrationOpportunity[] }>("list-opportunities").then((r) => r.opportunities),
    staleTime: 30_000,
  });
}

export function useDismissOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callIntegrationIntelligence("dismiss-opportunity", { id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integration-opportunities"] }),
    onError: (e: Error) => toast.error(e?.message ?? "Kunne ikke afvise forslaget"),
  });
}

export function useActivateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callIntegrationIntelligence<{ note?: string }>("activate-opportunity", { id }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["integration-opportunities"] });
      qc.invalidateQueries({ queryKey: ["integration-dna"] });
      toast.success(res?.note ?? "Aktiveret");
    },
    onError: (e: Error) => toast.error(e?.message ?? "Kunne ikke aktivere"),
  });
}
