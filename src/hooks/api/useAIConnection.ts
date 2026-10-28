import { useQuery } from "@tanstack/react-query";
import { invokeFunction } from "@/lib/functions";
import { explainError } from "@/lib/errors";

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
      try {
        const data = await invokeFunction<{ model?: string } | null>("ai-health", { body: {} });
        return { online: true, detail: data?.model ?? "Ollama" };
      } catch (error) {
        return { online: false, detail: explainError(error, { action: "check the AI connection" }).message };
      }
    },
    staleTime: 60_000,
  });
}
