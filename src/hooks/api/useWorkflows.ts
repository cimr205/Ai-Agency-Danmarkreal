import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useWorkflows() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ["workflows", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workflows")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useToggleWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("workflows").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("workflows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function sendWorkflowChat(messages: ChatMessage[]): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const resp = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workflow-assistant`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ messages }),
    }
  );

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Netværksfejl" }));
    throw new Error(err.error || `Fejl ${resp.status}`);
  }

  const data = await resp.json();
  return data.reply;
}
