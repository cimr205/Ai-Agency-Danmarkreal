import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface WorkspaceEvent {
  id: string;
  company_id: string;
  type: string;
  source_module: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  actor_user_id: string | null;
  created_at: string;
}

export function useWorkspaceEvents(limit = 50) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const companyId = profile?.company_id;

  const query = useQuery({
    queryKey: ["workspace-events", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<WorkspaceEvent[]> => {
      const { data, error } = await supabase
        .from("workspace_events")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as WorkspaceEvent[];
    },
  });

  // Realtime subscription — every new event fans into the UI live.
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`we-${companyId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "workspace_events", filter: `company_id=eq.${companyId}` },
        () => qc.invalidateQueries({ queryKey: ["workspace-events", companyId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, qc]);

  return query;
}

export interface AutopilotAction {
  id: string;
  company_id: string;
  user_id: string;
  action_id: string;
  action_type: string;
  category: string;
  headline: string;
  status: string;
  rationale: string | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  triggered_by_event: string | null;
  suggested_by: string | null;
  created_at: string;
  executed_at: string | null;
}

export function useAutopilotActions() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const companyId = profile?.company_id;

  const query = useQuery({
    queryKey: ["autopilot-actions", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<AutopilotAction[]> => {
      const { data, error } = await supabase
        .from("autopilot_actions")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as AutopilotAction[];
    },
  });

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`aa-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "autopilot_actions", filter: `company_id=eq.${companyId}` },
        () => qc.invalidateQueries({ queryKey: ["autopilot-actions", companyId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, qc]);

  return query;
}

export function useUpdateActionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "executed" | "dismissed" | "failed" }) => {
      const operation = status === "dismissed" ? "reject" : status === "failed" ? "retry" : "approve";
      const { error } = await supabase.functions.invoke("ai-operating-manager", {
        body: { operation, actionId: id },
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "dismissed" ? "Forslag afvist" : "Forslag opdateret");
      qc.invalidateQueries({ queryKey: ["autopilot-actions"] });
    },
    onError: (e: Error) => toast.error(e?.message ?? "Kunne ikke opdatere"),
  });
}

export function useExecuteAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: AutopilotAction) => {
      // Side effects are claimed atomically, permission-checked and executed
      // server-side. The browser never receives connector secrets or webhook URLs.
      const { data, error } = await supabase.functions.invoke("ai-operating-manager", {
        body: { operation: action.status === "failed" ? "retry" : "approve", actionId: action.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Handling udført");
      qc.invalidateQueries({ queryKey: ["autopilot-actions"] });
    },
    onError: (e: Error) => toast.error(e?.message ?? "Udførelse fejlede"),
  });
}

export function useEventTypeStream(companyId: string | undefined, types: string[]) {
  // Optional helper for module-specific listeners (kept for future use).
  const [last, setLast] = useState<WorkspaceEvent | null>(null);
  const typesKey = types.join(",");
  useEffect(() => {
    if (!companyId) return;
    const acceptedTypes = typesKey ? typesKey.split(",") : [];
    const channel = supabase
      .channel(`et-${companyId}-${typesKey}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "workspace_events", filter: `company_id=eq.${companyId}` },
        (p) => {
          const ev = p.new as WorkspaceEvent;
          if (acceptedTypes.length === 0 || acceptedTypes.includes(ev.type)) setLast(ev);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, typesKey]);
  return last;
}
