// deno-lint-ignore no-explicit-any
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

export interface CompanyAI {
  url: string;
  apiKey: string;
  model: string;
}

// Every AI feature in the app resolves the same per-company OpenAI
// connection — the `openai_accounts` table (company_id, api_key, status),
// managed via the `voice-agent-connect-openai` edge function's
// save/test/disconnect actions and surfaced in Settings → AI. One
// tenant-owned key, used everywhere, not a shared platform key.
export async function getCompanyAI(
  // deno-lint-ignore no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  companyId: string,
): Promise<CompanyAI | null> {
  const { data } = await supabase
    .from("openai_accounts")
    .select("api_key, status")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!data || data.status !== "connected" || !data.api_key) return null;
  return { url: "https://api.openai.com/v1/chat/completions", apiKey: data.api_key, model: "gpt-4o-mini" };
}

export const AI_NOT_CONNECTED_MESSAGE =
  "Ingen AI-udbyder forbundet endnu. Forbind ChatGPT under Indstillinger → AI for at bruge AI-funktioner.";

/**
 * OpenAI returns HTTP 429 for two very different situations — real
 * short-term rate limiting, and a $0 account with no payment method
 * attached ("insufficient_quota") — and callers need to tell those apart.
 * A fresh key almost always hits insufficient_quota first, which reads
 * nothing like "rate limit" to a user, so a generic "try again" message
 * is actively misleading. Pass the still-unread Response; this consumes
 * its body.
 */
export async function describeOpenAIError(response: Response): Promise<{ status: number; message: string }> {
  const status = response.status;
  let body: { error?: { message?: string; type?: string; code?: string } } | null = null;
  try {
    body = await response.json();
  } catch {
    // ignore, body wasn't JSON
  }
  const code = body?.error?.code ?? body?.error?.type;

  if (status === 401) {
    return { status, message: "OpenAI afviste nøglen — forbind den igen under Indstillinger → AI." };
  }
  if (status === 429 && code === "insufficient_quota") {
    return {
      status,
      message: "Jeres OpenAI-konto har ingen kredit tilbage. Tilføj en betalingsmetode på platform.openai.com/account/billing, så virker AI-funktionerne igen.",
    };
  }
  if (status === 429) {
    return { status, message: "OpenAI rate-limiter jeres konto lige nu — prøv igen om et øjeblik." };
  }
  return { status, message: body?.error?.message ? `AI-fejl: ${body.error.message}` : `AI-kald fejlede (HTTP ${status}).` };
}
