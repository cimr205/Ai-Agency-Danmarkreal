import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AiActionMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AiActionResult {
  reply: string;
  actions: Array<{ tool: string; input: unknown; result: unknown; status: "ok" | "error"; error?: string }>;
}

export function useAiActions() {
  return useMutation({
    mutationFn: async (input: { messages: AiActionMessage[]; confirm?: boolean }): Promise<AiActionResult> => {
      const { data, error } = await supabase.functions.invoke("ai-actions", { body: input });
      if (error) throw error;
      return data as AiActionResult;
    },
    onError: (e: Error) => toast.error(e?.message ?? "AI-handling fejlede"),
  });
}
