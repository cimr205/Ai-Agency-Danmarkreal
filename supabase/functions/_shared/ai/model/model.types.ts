export type SupportedLanguage = "da" | "en" | "de";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  timeoutMs?: number;
}

export interface StructuredResult<T> {
  ok: boolean;
  data: T | null;
  error: string | null;
  repaired: boolean;
}
