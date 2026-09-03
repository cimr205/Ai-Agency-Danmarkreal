import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Reads the DNA engine's own snapshot of what this workspace can
// currently do. Calls the integration-intelligence edge function's
// get-capabilities action (which recalculates from live connections —
// both Composio and native OAuth, e.g. personal Gmail — before
// returning) rather than a raw table select, so a lead/deal panel opened
// without ever having visited the Integration Centre still sees a fresh,
// correct answer. Frontend modules ask "do we have email.send?", never
// "is Gmail connected?" — the capability-first principle used throughout
// the AI engine and Integration Centre.
export interface WorkspaceCapabilityRow {
  capability_id: string;
  provider: string;
  status: "available" | "expired" | "error";
}

async function callIntegrationIntelligence<T = unknown>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("integration-intelligence", { body: { action, ...body } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function useWorkspaceCapabilities() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["workspace-capabilities", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: () => callIntegrationIntelligence<{ capabilities: WorkspaceCapabilityRow[] }>("get-capabilities").then((r) => r.capabilities),
    staleTime: 30_000,
  });
}

export function useHasCapability(capabilityId: string): boolean {
  const { data } = useWorkspaceCapabilities();
  return (data ?? []).some((c) => c.capability_id === capabilityId);
}
