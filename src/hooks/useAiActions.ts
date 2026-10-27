import { useMutation } from "@tanstack/react-query";
import { invokeFunction } from "@/lib/functions";
import { showError } from "@/lib/showError";

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
    mutationFn: async (input: { messages: AiActionMessage[]; confirm?: boolean }): Promise<AiActionResult> =>
      invokeFunction<AiActionResult>("ai-actions", { body: input }),
    onError: (e) => showError(e, { module: "ai-actions" }),
  });
}
