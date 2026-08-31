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
