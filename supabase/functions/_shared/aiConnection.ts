// deno-lint-ignore no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

// Every AI feature in the app resolves the same model — a self-hosted
// Ollama instance (LOCAL_LLM_BASE_URL / LOCAL_LLM_MODEL), per the approved
// stack (Ollama/llama.cpp only — no OpenAI, no Groq, no other hosted LLM
// API). This used to be a per-company "connect your own OpenAI/Groq key"
// system (openai_accounts table) — removed per explicit instruction.
// Ollama is one shared platform-level instance (Railway-hosted), not a
// per-tenant credential, so there is no more "connect your AI provider"
// step: every company gets AI automatically once LOCAL_LLM_BASE_URL is
// configured. `companyId` is kept as a parameter for call-site
// compatibility and because a genuinely per-tenant local endpoint (e.g. a
// company's own on-prem Ollama box) is a plausible future need — it's
// currently unused.
export interface CompanyAI {
  url: string;
  apiKey: string;
  model: string;
  provider: "local";
}

function normalizeEndpoint(url: string) {
  const clean = url.replace(/\/$/, "");
  if (clean.endsWith("/chat/completions")) return clean;
  return clean.endsWith("/v1") ? `${clean}/chat/completions` : `${clean}/v1/chat/completions`;
}

export async function getCompanyAI(
  // deno-lint-ignore no-explicit-any
  _supabase: SupabaseClient<any, any, any>,
  _companyId: string,
): Promise<CompanyAI | null> {
  const baseUrl = Deno.env.get("LOCAL_LLM_BASE_URL");
  const model = Deno.env.get("LOCAL_LLM_MODEL");
  if (!baseUrl || !model) return null;
  return {
    url: normalizeEndpoint(baseUrl),
    apiKey: Deno.env.get("LOCAL_LLM_API_KEY") ?? "ollama",
    model,
    provider: "local",
  };
}

export const AI_NOT_CONNECTED_MESSAGE =
  "AI-modellen er ikke tilgængelig lige nu (LOCAL_LLM_BASE_URL er ikke konfigureret eller den selv-hostede model svarer ikke).";

/**
 * Explains a non-ok response from the local Ollama endpoint. Kept as a
 * function (not inlined at call sites) because every caller needs the
 * same "read the body once, degrade to a generic message if it isn't
 * JSON" handling, and because Ollama's OpenAI-compatible surface can
 * still return the same shape of { error: { message } } object OpenAI
 * does for a bad request (e.g. unknown model name).
 */
export async function describeOpenAIError(
  response: Response,
  _provider: "local" = "local",
): Promise<{ status: number; message: string }> {
  const status = response.status;
  let body: { error?: { message?: string } } | null = null;
  try {
    body = await response.json();
  } catch {
    // ignore, body wasn't JSON
  }
  if (status === 404) {
    return { status, message: "Den konfigurerede model er ikke hentet på den selv-hostede Ollama-instans." };
  }
  return {
    status,
    message: body?.error?.message
      ? `AI-fejl: ${body.error.message}`
      : `Den selv-hostede model svarede ikke korrekt (HTTP ${status}).`,
  };
}
