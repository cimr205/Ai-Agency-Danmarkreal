import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.91.0";

export type ActionRisk = "low" | "medium" | "high" | "critical";
export interface ActionContext { db: SupabaseClient; companyId: string; idempotencyKey: string; correlationId: string; }
export interface ActionResult { output: Record<string, unknown>; providerReference?: string; }
export interface ActionDefinition {
  name: string; risk: ActionRisk; approvalRequired: boolean; internallyTransactional: boolean;
  idempotency: "database" | "provider-header";
  validate(input: Record<string, unknown>): string | null;
  execute(input: Record<string, unknown>, context: ActionContext): Promise<ActionResult>;
}

const webhook: ActionDefinition = {
  name: "webhook", risk: "medium", approvalRequired: false, internallyTransactional: false,
  idempotency: "provider-header",
  validate(input) {
    if (typeof input.url !== "string") return "url is required";
    try { const url = new URL(input.url); if (url.protocol !== "https:") return "only HTTPS webhooks are allowed"; }
    catch { return "url is invalid"; }
    return null;
  },
  async execute(input, context) {
    const response = await fetch(String(input.url), {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": context.idempotencyKey,
        "x-correlation-id": context.correlationId },
      body: JSON.stringify(input.payload ?? {}),
      signal: AbortSignal.timeout(20_000),
    });
    const responseText = (await response.text()).slice(0, 8_000);
    if (!response.ok) {
      const error = new Error(`Webhook returned HTTP ${response.status}`) as Error & { retryable?: boolean; uncertain?: boolean };
      // Only a provider refusal before execution is automatically retryable.
      // Timeouts/5xx are uncertain and require review to avoid repeating a
      // side effect after the provider actually succeeded.
      error.retryable = response.status === 429;
      error.uncertain = response.status === 408 || response.status >= 500;
      throw error;
    }
    return { output: { status: response.status, body: responseText }, providerReference: response.headers.get("x-request-id") ?? undefined };
  },
};

export const workflowActions = new Map<string, ActionDefinition>([[webhook.name, webhook]]);
