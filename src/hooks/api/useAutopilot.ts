import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

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
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "executed" | "dismissed" | "failed" }) => {
      const updates: { status: typeof status; executed_at?: string } = { status };
      if (status === "executed") updates.executed_at = new Date().toISOString();
      const { error } = await supabase
        .from("autopilot_actions")
        .update(updates)
        .eq("id", id)
        .eq("company_id", profile!.company_id!);
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
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (action: AutopilotAction) => {
      // Execute the action by routing it to the right module.
      // For now we support: trigger_webhook, send_email (as proposal -> webhook bridge).
      const payload = (action.payload ?? {}) as Record<string, unknown> & { provider?: string; to?: string; subject?: string; body?: string };
      let result: unknown = { ok: true };

      if (action.action_type === "trigger_webhook") {
        const provider = payload.provider as string;
        const { data: integ } = await supabase
          .from("integrations").select("metadata,status")
          .eq("company_id", profile!.company_id!)
          .eq("provider", provider).maybeSingle();
        if (!integ || integ.status !== "connected") throw new Error(`${provider} ikke forbundet`);
        const url = (integ.metadata as { webhook_url?: string } | null)?.webhook_url;
        if (!url) throw new Error(`Mangler webhook URL for ${provider}`);
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "autopilot", ...payload }),
        });
        result = { status: res.status };
      } else if (action.action_type === "send_email") {
        // gmail-send requires `message`, not `body` — this previously always
        // failed with "Missing required fields: to, subject, message".
        const { data, error } = await supabase.functions.invoke("gmail-send", {
          body: { to: payload.to, subject: payload.subject, message: payload.body },
        }).catch((e) => ({ data: null, error: e }));
        if (error) throw new Error(error.message ?? "gmail-send fejlede");
        result = data;
      }

      const { error } = await supabase
        .from("autopilot_actions")
        .update({ status: "executed", executed_at: new Date().toISOString(), result: result as Json })
        .eq("id", action.id);
      if (error) throw error;
      return result;
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
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`et-${companyId}-${types.join(",")}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "workspace_events", filter: `company_id=eq.${companyId}` },
        (p) => {
          const ev = p.new as WorkspaceEvent;
          if (types.length === 0 || types.includes(ev.type)) setLast(ev);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [companyId, types.join(",")]);
  return last;
}
