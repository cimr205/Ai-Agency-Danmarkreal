// deno-lint-ignore no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

export interface CompanyAI {
  url: string;
  apiKey: string;
  model: string;
  provider: "openai" | "groq";
}

export const PROVIDER_CHAT_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
};

export const PROVIDER_MODELS_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/models",
  groq: "https://api.groq.com/openai/v1/models",
};

// Default model per provider — both speak the OpenAI chat-completions
// format, so every caller in the app only ever changes {url, apiKey,
// model}, never its request/response parsing.
const PROVIDER_DEFAULT_MODEL: Record<string, string> = {
  openai: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
};

// Every AI feature in the app resolves the same per-company AI connection
// — the `openai_accounts` table (company_id, provider, api_key, status),
// managed via the `voice-agent-connect-openai` edge function's
// save/test/disconnect actions and surfaced in Settings → AI. One
// tenant-owned key, used everywhere, not a shared platform key. Groq is
// offered alongside OpenAI as a genuinely free (no payment method)
// OpenAI-API-compatible alternative.
export async function getCompanyAI(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  companyId: string,
): Promise<CompanyAI | null> {
  const { data } = await supabase
    .from("openai_accounts")
    .select("api_key, status, provider")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data || data.status !== "connected" || !data.api_key) return null;
  const provider = (data.provider === "groq" ? "groq" : "openai") as "openai" | "groq";
  return {
    url: PROVIDER_CHAT_URLS[provider],
    apiKey: data.api_key,
    model: PROVIDER_DEFAULT_MODEL[provider],
    provider,
  };
}

export const AI_NOT_CONNECTED_MESSAGE =
  "Ingen AI-udbyder forbundet endnu. Forbind ChatGPT eller Groq (gratis) under Indstillinger → AI for at bruge AI-funktioner.";

/**
 * OpenAI (and Groq, same API shape) return HTTP 429 for two very different
 * situations — real short-term rate limiting, and a $0 OpenAI account with
 * no payment method attached ("insufficient_quota") — and callers need to
 * tell those apart. A fresh OpenAI key almost always hits insufficient_quota
 * first, which reads nothing like "rate limit" to a user, so a generic
 * "try again" message is actively misleading. Pass the still-unread
 * Response; this consumes its body. `provider` only changes the wording
 * (Groq's free tier has no billing page to point at).
 */
export async function describeOpenAIError(
  response: Response,
  provider: "openai" | "groq" = "openai",
): Promise<{ status: number; message: string }> {
  const status = response.status;
  let body: { error?: { message?: string; type?: string; code?: string } } | null = null;
  try {
    body = await response.json();
  } catch {
    // ignore, body wasn't JSON
  }
  const code = body?.error?.code;
  const type = body?.error?.type;
  const providerLabel = provider === "groq" ? "Groq" : "OpenAI";

  // OpenAI uses "insufficient_quota" for `type` consistently, but `code`
  // varies by exactly how the account ran out (seen live:
  // "credit_balance_exhausted" for a $0 balance, "insufficient_quota" for
  // an exceeded plan limit) — check both instead of just one, or a real
  // zero-credit account gets mislabeled as ordinary rate limiting and told
  // to "try again shortly", which it never will.
  const isQuotaExhausted = type === "insufficient_quota"
    || code === "insufficient_quota"
    || code === "credit_balance_exhausted";

  if (status === 401) {
    return { status, message: `${providerLabel} afviste nøglen — forbind den igen under Indstillinger → AI.` };
  }
  if (status === 429 && isQuotaExhausted) {
    return {
      status,
      message: provider === "groq"
        ? "Groq-kontoen har ramt sit gratis loft. Prøv igen senere, eller forbind OpenAI i stedet under Indstillinger → AI."
        : "Jeres OpenAI-konto har ingen kredit tilbage. Tilføj en betalingsmetode på platform.openai.com/account/billing, så virker AI-funktionerne igen.",
    };
  }
  if (status === 429) {
    return { status, message: `${providerLabel} rate-limiter jeres konto lige nu — prøv igen om et øjeblik.` };
  }
  return { status, message: body?.error?.message ? `AI-fejl: ${body.error.message}` : `AI-kald fejlede (HTTP ${status}).` };
}
