// Provider-neutral critical-alert adapter (P11 observability hardening).
//
// The external alert destination is an explicitly parked decision — this
// module is prepared and ready to dispatch, but no destination is bound.
// Every branch below is a no-op until the corresponding env var is set by
// a future, deliberate decision:
//   ALERT_SLACK_WEBHOOK_URL      — Slack incoming webhook URL
//   ALERT_GENERIC_WEBHOOK_URL    — any JSON-POST webhook (Make/Zapier/n8n/etc.)
//   ALERT_GENERIC_WEBHOOK_SECRET — optional shared secret, sent as x-webhook-secret
//   ALERT_EMAIL_TO               — recipient address
//   ALERT_EMAIL_API_KEY          — Resend-compatible API key (api.resend.com)
//   ALERT_EMAIL_FROM             — verified sender address for that provider
//
// All of the above are server-side Edge Function secrets only — never
// exposed to the frontend, never logged. sendCriticalAlert() never throws:
// an alerting failure must never break the caller's own error-handling path.

export type AlertSeverity = "critical" | "error" | "warning";

export interface CriticalAlertEvent {
  severity: AlertSeverity;
  /** Short machine-readable origin, e.g. "workflow-runner", "stripe-payment-webhook". */
  source: string;
  /** Human-readable summary. Must not contain secrets, tokens, or raw stack traces. */
  message: string;
  companyId?: string | null;
  requestId?: string | null;
  jobId?: string | null;
  /** Extra structured context. Caller is responsible for pre-sanitizing (no tokens/keys). */
  context?: Record<string, unknown>;
  occurredAt?: string;
}

interface AlertPayload {
  severity: AlertSeverity;
  source: string;
  message: string;
  company_id: string | null;
  request_id: string | null;
  job_id: string | null;
  context: Record<string, unknown>;
  occurred_at: string;
}

const SECRET_KEY_PATTERN = /token|secret|password|api[_-]?key|authorization/i;

function sanitizeContext(context: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!context) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = SECRET_KEY_PATTERN.test(key) ? "[redacted]" : value;
  }
  return out;
}

function buildPayload(event: CriticalAlertEvent): AlertPayload {
  return {
    severity: event.severity,
    source: event.source,
    message: event.message.slice(0, 2000),
    company_id: event.companyId ?? null,
    request_id: event.requestId ?? null,
    job_id: event.jobId ?? null,
    context: sanitizeContext(event.context),
    occurred_at: event.occurredAt ?? new Date().toISOString(),
  };
}

function severityEmoji(severity: AlertSeverity): string {
  if (severity === "critical") return "🔴";
  if (severity === "error") return "🟠";
  return "🟡";
}

async function trySlack(payload: AlertPayload): Promise<void> {
  const url = Deno.env.get("ALERT_SLACK_WEBHOOK_URL");
  if (!url) return;
  try {
    const lines = [
      `${severityEmoji(payload.severity)} *${payload.severity.toUpperCase()}* — ${payload.source}`,
      payload.message,
    ];
    if (payload.company_id) lines.push(`company: ${payload.company_id}`);
    if (payload.job_id) lines.push(`job: ${payload.job_id}`);
    if (payload.request_id) lines.push(`request: ${payload.request_id}`);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n") }),
    });
  } catch (e) {
    console.error("sendCriticalAlert: slack dispatch failed", e);
  }
}

async function tryGenericWebhook(payload: AlertPayload): Promise<void> {
  const url = Deno.env.get("ALERT_GENERIC_WEBHOOK_URL");
  if (!url) return;
  try {
    const secret = Deno.env.get("ALERT_GENERIC_WEBHOOK_SECRET");
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-webhook-secret": secret } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error("sendCriticalAlert: generic webhook dispatch failed", e);
  }
}

async function tryEmail(payload: AlertPayload): Promise<void> {
  const to = Deno.env.get("ALERT_EMAIL_TO");
  if (!to) return;
  const apiKey = Deno.env.get("ALERT_EMAIL_API_KEY");
  const from = Deno.env.get("ALERT_EMAIL_FROM");
  if (!apiKey || !from) {
    console.warn("sendCriticalAlert: ALERT_EMAIL_TO is set but ALERT_EMAIL_API_KEY/ALERT_EMAIL_FROM is missing — skipping email alert");
    return;
  }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[${payload.severity.toUpperCase()}] ${payload.source}`,
        text: `${payload.message}\n\n${JSON.stringify(payload, null, 2)}`,
      }),
    });
  } catch (e) {
    console.error("sendCriticalAlert: email dispatch failed", e);
  }
}

/**
 * Fire-and-forget critical alert dispatch. Safe to call unconditionally —
 * every channel is a no-op until its destination env vars are configured,
 * and no channel's failure throws back to the caller.
 */
export async function sendCriticalAlert(event: CriticalAlertEvent): Promise<void> {
  const payload = buildPayload(event);
  await Promise.allSettled([
    trySlack(payload),
    tryGenericWebhook(payload),
    tryEmail(payload),
  ]);
}
