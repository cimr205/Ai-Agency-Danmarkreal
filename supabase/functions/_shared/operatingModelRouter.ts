// Small OpenAI-compatible model abstraction for the Operating Manager.
//
// E2E-001 (docs/full-system-e2e-audit.md): this used to resolve
// exclusively to the shared self-hosted Ollama instance
// (LOCAL_LLM_BASE_URL/LOCAL_LLM_MODEL). That instance is down (confirmed
// this session, and independently confirmed live: the Operating Manager
// panel threw an uncaught "Den konfigurerede model er ikke hentet på den
// selv-hostede Ollama-instans." exception on every single page load).
// Routed to Groq instead — already the explicitly-approved, deployed,
// and tested provider for the newer AI Action Engine (ai-message) this
// session. Same GROQ_API_KEY/GROQ_MODEL/GROQ_BASE_URL secrets, already
// configured on this project.
//
// Scope note: 16 other edge functions (autopilot-brief, meta-ads-ai,
// deal-coach, gmail-sync, ai-email-writer, csv-import-leads, ai-actions,
// ai-health, lead-ai-recommend, workflow-assistant, workflow-runner,
// autopilot-agent, voice-agent-respond, smart-assistant, lead-gen-api,
// meeting-summary) still import _shared/aiConnection.ts's Ollama-only
// getCompanyAI/describeOpenAIError directly and are NOT fixed by this
// change — only the Operating Manager panel (the one causing the live,
// on-every-page-load crash) is back on a working model. Migrating the
// other 16 is real, separate follow-up work.
export type ModelPurpose = "route" | "extract" | "plan" | "summarize";

export interface RoutedModel {
  provider: string;
  model: string;
  endpoint: string;
  apiKey: string;
  tier: "fast" | "reasoning";
}

const PURPOSE_TIER: Record<ModelPurpose, RoutedModel["tier"]> = {
  route: "fast",
  extract: "fast",
  summarize: "fast",
  plan: "reasoning",
};

// deno-lint-ignore require-await
export async function resolveModel(
  _db: unknown,
  _companyId: string,
  purpose: ModelPurpose,
): Promise<RoutedModel | null> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return null;
  const baseUrl = (Deno.env.get("GROQ_BASE_URL") ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
  return {
    provider: "groq",
    model: Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-20b",
    endpoint: `${baseUrl}/chat/completions`,
    apiKey,
    tier: PURPOSE_TIER[purpose],
  };
}

async function describeGroqError(response: Response): Promise<{ status: number; message: string }> {
  const status = response.status;
  let body: { error?: { message?: string } } | null = null;
  try {
    body = await response.json();
  } catch {
    // ignore, body wasn't JSON
  }
  if (status === 429) return { status, message: "AI-modellen er midlertidigt overbelastet — prøv igen om lidt." };
  return {
    status,
    message: body?.error?.message ? `AI-fejl: ${body.error.message}` : `AI-modellen svarede ikke korrekt (HTTP ${status}).`,
  };
}

export async function generateStructured(
  model: RoutedModel,
  system: string,
  user: string,
  // Groq measured at ~0.75-1.0s per planning-shaped call this session —
  // generous timeout kept anyway as a real upper bound, not a tuned one.
  timeoutMs = 20_000,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(model.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${model.apiKey}`,
      },
      body: JSON.stringify({
        model: model.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!response.ok) {
      const { message } = await describeGroqError(response);
      throw new Error(message);
    }
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Modellen returnerede intet JSON-indhold");
    return JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
  } finally {
    clearTimeout(timer);
  }
}
