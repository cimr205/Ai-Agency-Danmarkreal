import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface McpToken {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export function useMcpTokens() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["mcp-tokens", profile?.company_id],
    enabled: !!profile?.company_id,
    queryFn: async (): Promise<McpToken[]> => {
      const { data, error } = await supabase
        .from("mcp_tokens")
        .select("id,name,token_prefix,scopes,last_used_at,revoked_at,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as McpToken[];
    },
  });
}

export function useIssueMcpToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<{ id: string; token: string; prefix: string }> => {
      const { data, error } = await supabase.rpc("issue_mcp_token", { _name: name });
      if (error) throw error;
      const row = data[0];
      return { id: row.id, token: row.token, prefix: row.prefix };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mcp-tokens"] }),
    onError: (e: Error) => toast.error(e?.message ?? "Kunne ikke oprette token"),
  });
}

export function useRevokeMcpToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("mcp_tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Token tilbagekaldt");
      qc.invalidateQueries({ queryKey: ["mcp-tokens"] });
    },
    onError: (e: Error) => toast.error(e?.message ?? "Kunne ikke tilbagekalde"),
  });
}
