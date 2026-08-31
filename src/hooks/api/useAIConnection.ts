import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/errors";

// Same table + edge function the voice agent's own OpenAI connect card
// already uses (openai_accounts + voice-agent-connect-openai) — every AI
// feature in the app (workflows, AI-email, deal coach, smart assistant,
// m.fl.) resolves this same connection server-side, not a shared platform
// key. One connect flow, used everywhere.
export interface AIConnectionStatus {
  id: string;
  status: "connected" | "error";
  last_tested_at: string | null;
  last_error: string | null;
}

export function useAIConnectionStatus() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["ai-connection-status", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async (): Promise<AIConnectionStatus | null> => {
      const { data, error } = await supabase
        .from("openai_accounts")
        .select("id, status, last_tested_at, last_error")
        .eq("company_id", profile!.company_id!)
        .maybeSingle();
      if (error) throw error;
      return data as AIConnectionStatus | null;
    },
    staleTime: 30_000,
  });
}

export function useConnectAIProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (apiKey: string) => {
      const { error } = await supabase.functions.invoke("voice-agent-connect-openai", { body: { action: "save", apiKey } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ChatGPT forbundet");
      qc.invalidateQueries({ queryKey: ["ai-connection-status"] });
    },
    onError: (e: Error) => toast.error(getErrorMessage(e) || "Kunne ikke forbinde"),
  });
}

export function useDisconnectAIProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("voice-agent-connect-openai", { body: { action: "disconnect" } });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("AI-udbyder afbrudt");
      qc.invalidateQueries({ queryKey: ["ai-connection-status"] });
    },
    onError: (e: Error) => toast.error(getErrorMessage(e) || "Kunne ikke afbryde"),
  });
}
