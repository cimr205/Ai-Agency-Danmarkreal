import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { invokeFunction } from "@/lib/functions";
import { showError } from "@/lib/showError";
import { useAuth } from "@/hooks/useAuth";
import { t3 } from '@/lib/inlineI18n';

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
  model: {
    configured: boolean;
    online: boolean;
    provider: string | null;
    name: string | null;
    checkedAt: string;
    error?: string;
  } | null;
  generatedAt: string;
}

interface CommandResult {
  reply: string;
  proposals: OperatingAction[];
  route: string;
  localModelAvailable?: boolean;
  latencyMs?: number;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  return invokeFunction<T>("ai-operating-manager", { body });
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
    mutationFn: (text: string) => invoke<CommandResult>({ operation: "command", text }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["operating-manager"] }),
    onError: (error) => showError(error, { module: "ai-operating-manager" }),
  });
}

export function useOperatingAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ operation, actionId, input }: { operation: "approve" | "reject" | "retry" | "edit"; actionId: string; input?: Record<string, unknown> }) =>
      invoke<{ action?: OperatingAction; status?: string }>({ operation, actionId, ...(input ? { input } : {}) }),
    onSuccess: (_data, variables) => {
      toast.success(variables.operation === "reject" ? t3("Forslaget er afvist", "The suggestion was rejected", "Der Vorschlag wurde abgelehnt") : variables.operation === "edit" ? t3("Forslaget er opdateret", "The suggestion was updated", "Der Vorschlag wurde aktualisiert") : t3("Handlingen er udført og verificeret", "The action was completed and verified", "Die Aktion wurde ausgeführt und geprüft"));
      queryClient.invalidateQueries({ queryKey: ["operating-manager"] });
      queryClient.invalidateQueries({ queryKey: ["autopilot-actions"] });
    },
    onError: (error) => showError(error, { module: "ai-operating-manager" }),
  });
}
