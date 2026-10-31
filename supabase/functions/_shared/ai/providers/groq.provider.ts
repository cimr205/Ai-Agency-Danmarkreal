/* eslint-disable @typescript-eslint/no-explicit-any */
// deno-lint-ignore-file no-explicit-any
import { z } from "npm:zod@3.23.8";
import { aiConfig } from "../config/ai.config.ts";
import type { ChatMessage, ChatOptions, StructuredResult } from "../model/model.types.ts";
import type { AIModelProvider, ToolDefinition, ToolCall } from "./model-provider.types.ts";
import { RateLimitedError, ProviderUnavailableError } from "./model-provider.types.ts";

function chatCompletionsUrl(): string {
  return `${aiConfig.groq.baseUrl}/chat/completions`;
}

function parseRetryAfterMs(res: Response): number | null {
  const header = res.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return seconds * 1000;
  }
  return null;
}

async function postChat(messages: ChatMessage[], opts: ChatOptions & { json?: boolean; tools?: ToolDefinition[] } = {}): Promise<any> {
  if (!aiConfig.groq.apiKey) throw new ProviderUnavailableError("GROQ_API_KEY is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? aiConfig.groq.timeoutMs);
  try {
    const res = await fetch(chatCompletionsUrl(), {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiConfig.groq.apiKey}` },
      body: JSON.stringify({
        model: aiConfig.groq.model,
        temperature: opts.temperature ?? 0.1,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        ...(opts.tools ? { tools: opts.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })) } : {}),
        messages,
      }),
    });

    if (res.status === 429) throw new RateLimitedError(parseRetryAfterMs(res));
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ProviderUnavailableError(`Groq request failed (${res.status}): ${text.slice(0, 300)}`);
    }
    return await res.json();
  } catch (e) {
    if (e instanceof RateLimitedError || e instanceof ProviderUnavailableError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") throw new ProviderUnavailableError("Groq request timed out");
    throw new ProviderUnavailableError(e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}

function stripFences(text: string): string {
  return text.replace(/^```json\s*|^```\s*|\s*```$/g, "").trim();
}

export const GroqProvider: AIModelProvider = {
  name: "groq",

  async generate(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const body = await postChat(messages, opts);
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Groq returned no content");
    return content;
  },

  async generateStructured<S extends z.ZodType>(messages: ChatMessage[], schema: S, opts: ChatOptions = {}): Promise<StructuredResult<z.output<S>>> {
    const attempt = async (msgs: ChatMessage[]): Promise<{ raw: string; parsed: unknown } | { error: string }> => {
      let body: any;
      try {
        body = await postChat(msgs, { ...opts, json: true });
      } catch (e) {
        // Rate limit / unavailable propagate as typed errors so the
        // orchestrator can distinguish them from "model produced garbage".
        if (e instanceof RateLimitedError || e instanceof ProviderUnavailableError) throw e;
        return { error: e instanceof Error ? e.message : String(e) };
      }
      const raw = body?.choices?.[0]?.message?.content;
      if (typeof raw !== "string") return { error: "Groq returned no content" };
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

    // Never repair-retry a rate limit or outage — only a genuine bad-output case.
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

  async generateWithTools(messages: ChatMessage[], tools: ToolDefinition[], opts: ChatOptions = {}): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
    const body = await postChat(messages, { ...opts, tools });
    const message = body?.choices?.[0]?.message;
    const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((tc: any) => {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function?.arguments ?? "{}"); } catch { /* leave empty on parse failure — validated downstream */ }
      return { name: tc.function?.name, arguments: args };
    });
    return { content: message?.content ?? null, toolCalls };
  },

  async *stream(messages: ChatMessage[], opts: ChatOptions = {}): AsyncGenerator<string> {
    if (!aiConfig.groq.apiKey) throw new ProviderUnavailableError("GROQ_API_KEY is not configured");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? aiConfig.groq.timeoutMs);
    try {
      const res = await fetch(chatCompletionsUrl(), {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiConfig.groq.apiKey}` },
        body: JSON.stringify({ model: aiConfig.groq.model, temperature: opts.temperature ?? 0.3, stream: true, messages }),
      });
      if (res.status === 429) throw new RateLimitedError(parseRetryAfterMs(res));
      if (!res.ok || !res.body) throw new ProviderUnavailableError(`Groq stream request failed (${res.status})`);
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
    if (!aiConfig.groq.apiKey) return { online: false, model: aiConfig.groq.model, detail: "GROQ_API_KEY not configured" };
    try {
      const res = await fetch(`${aiConfig.groq.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${aiConfig.groq.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { online: false, model: aiConfig.groq.model, detail: `HTTP ${res.status}` };
      return { online: true, model: aiConfig.groq.model };
    } catch (e) {
      return { online: false, model: aiConfig.groq.model, detail: e instanceof Error ? e.message : String(e) };
    }
  },
};
