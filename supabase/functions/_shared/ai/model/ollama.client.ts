// deno-lint-ignore-file no-explicit-any
import { z } from "npm:zod@3.23.8";
import { aiConfig, chatCompletionsUrl } from "../config/ai.config.ts";
import type { ChatMessage, ChatOptions, StructuredResult } from "./model.types.ts";

async function postChat(messages: ChatMessage[], opts: ChatOptions & { json?: boolean } = {}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? aiConfig.requestTimeoutMs);
  try {
    const res = await fetch(chatCompletionsUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiConfig.ollamaApiKey}` },
      body: JSON.stringify({
        model: aiConfig.model,
        temperature: opts.temperature ?? 0.1,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        messages,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Ollama request failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const body = await res.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Ollama returned no content");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

function stripFences(text: string): string {
  return text.replace(/^```json\s*|^```\s*|\s*```$/g, "").trim();
}

export const OllamaClient = {
  /** Plain conversational completion — no schema, no tool selection. */
  chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    return postChat(messages, opts);
  },

  /**
   * JSON completion validated against a Zod schema. One repair attempt on
   * parse/validation failure, then fail safe — never an infinite retry
   * loop, and the caller always gets a typed result instead of a thrown
   * exception that could crash a request.
   */
  async structured<S extends z.ZodType>(messages: ChatMessage[], schema: S, opts: ChatOptions = {}): Promise<StructuredResult<z.output<S>>> {
    const attempt = async (msgs: ChatMessage[]): Promise<{ raw: string; parsed: unknown } | { error: string }> => {
      let raw: string;
      try {
        raw = await postChat(msgs, { ...opts, json: true });
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
      try {
        return { raw, parsed: JSON.parse(stripFences(raw)) };
      } catch {
        return { error: "Model output was not valid JSON" };
      }
    };

    const first = await attempt(messages);
    if (!("error" in first)) {
      const validated = schema.safeParse(first.parsed);
      if (validated.success) return { ok: true, data: validated.data, error: null, repaired: false };
    }

    // Single repair pass: tell the model exactly what was wrong, ask again.
    const failureReason = "error" in first ? first.error : "Output did not match the required schema";
    const repairMessages: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: "error" in first ? "" : JSON.stringify((first as any).parsed) },
      { role: "user", content: `Your previous output was invalid: ${failureReason}. Return ONLY valid JSON matching the schema, nothing else.` },
    ];
    const second = await attempt(repairMessages);
    if (!("error" in second)) {
      const validated = schema.safeParse(second.parsed);
      if (validated.success) return { ok: true, data: validated.data, error: null, repaired: true };
      return { ok: false, data: null, error: `Schema validation failed after repair: ${validated.error.message}`, repaired: true };
    }
    return { ok: false, data: null, error: second.error, repaired: true };
  },

  /** Token stream for conversational (non-tool) responses. */
  async *stream(messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? aiConfig.requestTimeoutMs);
    try {
      const res = await fetch(chatCompletionsUrl(), {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiConfig.ollamaApiKey}` },
        body: JSON.stringify({ model: aiConfig.model, temperature: opts.temperature ?? 0.3, stream: true, messages }),
      });
      if (!res.ok || !res.body) throw new Error(`Ollama stream request failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === "[DONE]") return;
          try {
            const chunk = JSON.parse(payload);
            const delta = chunk?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) yield delta;
          } catch { /* ignore partial/non-JSON keepalive lines */ }
        }
      }
    } finally {
      clearTimeout(timer);
    }
  },

  async healthCheck(): Promise<{ online: boolean; model: string; detail?: string }> {
    try {
      const res = await fetch(chatCompletionsUrl().replace(/\/chat\/completions$/, "/models"), {
        headers: { Authorization: `Bearer ${aiConfig.ollamaApiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { online: false, model: aiConfig.model, detail: `HTTP ${res.status}` };
      return { online: true, model: aiConfig.model };
    } catch (e) {
      return { online: false, model: aiConfig.model, detail: e instanceof Error ? e.message : String(e) };
    }
  },
};
