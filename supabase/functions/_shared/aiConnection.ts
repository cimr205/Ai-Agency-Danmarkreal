/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

// E2E-004 (docs/full-system-e2e-audit.md): this used to resolve
// exclusively to a shared self-hosted Ollama instance (LOCAL_LLM_BASE_URL
// / LOCAL_LLM_MODEL). That instance is confirmed down (same root cause as
// E2E-001, which fixed the Operating Manager panel's separate model
// router) — every one of the 17 edge functions that import this file
// (autopilot-brief, meta-ads-ai, deal-coach, gmail-sync, ai-email-writer,
// generate-call-script, csv-import-leads, ai-actions, ai-health,
// lead-ai-recommend, workflow-assistant, workflow-runner, autopilot-agent,
// voice-agent-respond, smart-assistant, lead-gen-api, meeting-summary)
// was therefore non-functional in production. All of them call a plain
// OpenAI-compatible chat-completions endpoint via `ai.url`/`ai.model`/
// `ai.apiKey` (or, for autopilot-agent, the Vercel AI SDK's
// createOpenAICompatible against the same fields) — no caller branches on
// `ai.provider`, so routing this one shared resolver to Groq (the
// explicitly-approved, deployed, tested provider for the newer AI Action
// Engine this session) fixes all 17 without touching any of them.
// `companyId` is kept as a parameter for call-site compatibility and
// because a genuinely per-tenant model endpoint is a plausible future
// need — it's currently unused, same as before.
export interface CompanyAI {
  url: string;
  apiKey: string;
  model: string;
  provider: "groq";
}

export async function getCompanyAI(
  // deno-lint-ignore no-explicit-any
  _supabase: SupabaseClient<any, any, any>,
  _companyId: string,
): Promise<CompanyAI | null> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return null;
  const baseUrl = (Deno.env.get("GROQ_BASE_URL") ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
  return {
    url: `${baseUrl}/chat/completions`,
    apiKey,
    model: Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-20b",
    provider: "groq",
  };
}

export const AI_NOT_CONNECTED_MESSAGE = "AI-modellen er ikke tilgængelig lige nu (GROQ_API_KEY er ikke konfigureret).";

/**
 * Explains a non-ok response from the model endpoint. Kept as a function
 * (not inlined at call sites) because every caller needs the same "read
 * the body once, degrade to a generic message if it isn't JSON" handling.
 */
export async function describeOpenAIError(
  response: Response,
  _provider: "groq" = "groq",
): Promise<{ status: number; message: string }> {
  const status = response.status;
  let body: { error?: { message?: string } } | null = null;
  try {
    body = await response.json();
  } catch {
    // ignore, body wasn't JSON
  }
  if (status === 429) {
    return { status, message: "AI-modellen er midlertidigt overbelastet — prøv igen om lidt." };
  }
  return {
    status,
    message: body?.error?.message
      ? `AI-fejl: ${body.error.message}`
      : `AI-modellen svarede ikke korrekt (HTTP ${status}).`,
  };
}
