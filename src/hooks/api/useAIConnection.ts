import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// AI runs on one shared, self-hosted Ollama instance (approved stack:
// Ollama/llama.cpp only — no OpenAI, no Groq, no other hosted LLM API).
// There is no more per-company "connect your AI provider" step — every
// company gets AI automatically. This just reports whether the shared
// model is currently reachable, via the same resolve+call path every
// real AI feature uses (ai-actions, a near-zero-cost call).
export interface AIStatus {
  online: boolean;
  detail: string;
}

export function useAIStatus() {
  return useQuery({
    queryKey: ["ai-status"],
    queryFn: async (): Promise<AIStatus> => {
      const { data, error } = await supabase.functions.invoke("ai-health", { body: {} });
      if (error) {
        const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
        let message = error.message;
        try {
          const parsed = (await ctx?.json?.()) as { error?: string } | undefined;
          if (parsed?.error) message = parsed.error;
        } catch {
          // ignore, fall back to error.message
        }
        return { online: false, detail: message };
      }
      return { online: true, detail: (data as { model?: string } | null)?.model ?? "Ollama" };
    },
    staleTime: 60_000,
  });
}
