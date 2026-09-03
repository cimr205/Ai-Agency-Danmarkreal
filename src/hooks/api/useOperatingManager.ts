import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type SignalSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface OperatingSignal {
  id: string;
  signal_type: string;
  category: string;
  severity: SignalSeverity;
  confidence: number;
  title: string;
  reason: string;
  recommended_action: string | null;
  recommended_action_name: string | null;
  entity_type: string | null;
  entity_id: string | null;
  href: string | null;
  deadline: string | null;
  estimated_impact: Record<string, unknown>;
  last_detected_at: string;
}

export interface OperatingAction {
  id: string;
  action_type: string;
  headline: string;
  status: "proposed" | "awaiting_approval" | "approved" | "executing" | "completed" | "executed" | "failed" | "rejected" | "cancelled" | "dismissed" | string;
  rationale: string | null;
  risk_level: "low" | "medium" | "high" | "critical";
  connector: string;
  preview: { title?: string; fields?: Record<string, unknown>; rollback?: string | null } | null;
  execution_payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  failure_reason: string | null;
  attempt_count: number;
  created_at: string;
  executed_at: string | null;
}

export interface OperatingBrief {
  signals: OperatingSignal[];
  actions: OperatingAction[];
  integrations: Array<{ id: string; provider: string; status: string; account_label: string | null; last_sync_at: string | null }>;
  stats: { critical: number; today: number; opportunities: number; awaitingApproval: number };
  generatedAt: string;
}

interface CommandResult {
  reply: string;
  proposals: OperatingAction[];
  route: string;
  localModelAvailable?: boolean;
  latencyMs?: number;
  entity?: { type: string; id: string; label: string } | null;
}

export interface EntityContext {
  entity: { type: string; id: string; label: string };
  summary: Record<string, unknown>;
  deals?: Array<Record<string, unknown>>;
  openInvoices?: Array<Record<string, unknown>>;
  recentActivities: Array<{ id: string; type: string; body: string | null; created_at: string; next_step_at: string | null; completed_at: string | null }>;
  relevantSignals: OperatingSignal[];
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("ai-operating-manager", { body });
  if (error) {
    const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    if (context?.json) {
      const detail = await context.json().catch(() => null);
      if (detail?.error) throw new Error(detail.error);
    }
    throw error;
  }
  return data as T;
}

export function useOperatingBrief() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const companyId = profile?.company_id;
  const query = useQuery({
    queryKey: ["operating-manager", companyId],
    enabled: !!companyId,
    queryFn: () => invoke<OperatingBrief>({ operation: "brief" }),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!companyId) return;
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ["operating-manager", companyId] });
    const channel = supabase
      .channel(`operating-manager-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "autopilot_actions", filter: `company_id=eq.${companyId}` }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_signals", filter: `company_id=eq.${companyId}` }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, queryClient]);

  return query;
}

export function useOperatingCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ text, entity }: { text: string; entity?: { type: string; id: string } | null }) =>
      invoke<CommandResult>({ operation: "command", text, ...(entity ? { entity } : {}) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["operating-manager"] }),
    onError: (error: Error) => toast.error(error.message || "Kommandoen kunne ikke behandles"),
  });
}

// Selective, entity-scoped context (masterprompt §4/§19) — shown at the top
// of the panel when the user has an active lead/deal/customer/task open.
export function useEntityContext(entity: { type: string; id: string } | null) {
  return useQuery({
    queryKey: ["operating-manager-entity", entity?.type, entity?.id],
    enabled: !!entity,
    queryFn: () => invoke<EntityContext>({ operation: "entityContext", entityType: entity!.type, entityId: entity!.id }),
    staleTime: 30_000,
  });
}

export function useOperatingAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ operation, actionId, input }: { operation: "approve" | "reject" | "retry" | "edit"; actionId: string; input?: Record<string, unknown> }) =>
      invoke<{ action?: OperatingAction; status?: string }>({ operation, actionId, ...(input ? { input } : {}) }),
    onSuccess: (_data, variables) => {
      toast.success(variables.operation === "reject" ? "Forslaget er afvist" : variables.operation === "edit" ? "Forslaget er opdateret" : "Handlingen er udført og verificeret");
      queryClient.invalidateQueries({ queryKey: ["operating-manager"] });
      queryClient.invalidateQueries({ queryKey: ["autopilot-actions"] });
    },
    onError: (error: Error) => toast.error(error.message || "Handlingen fejlede"),
  });
}

