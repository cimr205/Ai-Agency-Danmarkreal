/* eslint-disable @typescript-eslint/no-explicit-any */
import type { z } from "npm:zod@3.23.8";
import type { ChatMessage, ChatOptions, StructuredResult } from "../model/model.types.ts";

export interface ToolDefinition {
  name: string;
  description: string;
  // deno-lint-ignore no-explicit-any
  parameters: Record<string, any>; // JSON Schema, derived from a capability's Zod inputSchema
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * The rest of the AI engine only ever talks to this interface — never to
 * Groq or Ollama directly. Swapping providers later means writing one new
 * class, not touching the orchestrator, planner, or router.
 */
export interface AIModelProvider {
  name: string;
  generate(messages: ChatMessage[], opts?: ChatOptions): Promise<string>;
  generateStructured<S extends z.ZodType>(messages: ChatMessage[], schema: S, opts?: ChatOptions): Promise<StructuredResult<z.output<S>>>;
  /** Tool-calling variant — preferred for capability selection when the provider supports it (§12). */
  generateWithTools(messages: ChatMessage[], tools: ToolDefinition[], opts?: ChatOptions): Promise<{ content: string | null; toolCalls: ToolCall[] }>;
  stream(messages: ChatMessage[], opts?: ChatOptions): AsyncGenerator<string>;
  healthCheck(): Promise<{ online: boolean; model: string; detail?: string }>;
}

export class RateLimitedError extends Error {
  constructor(public retryAfterMs: number | null) {
    super("Provider rate limited");
    this.name = "RateLimitedError";
  }
}

export class ProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}
