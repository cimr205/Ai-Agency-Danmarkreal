// Error monitoring for Supabase Edge Functions. Monitoring only: nothing in
// here changes what a function returns or throws.
//
// Deliberately dependency-free (no Sentry SDK import): it speaks the Sentry
// envelope protocol over fetch, so it adds no cold-start cost to 60+
// functions and sends exactly the fields listed below — nothing implicit.
//
//   SENTRY_DSN_EDGE     enables reporting (falls back to SENTRY_DSN). Unset = no-op.
//   SENTRY_ENVIRONMENT  optional, defaults to "production"
//   SENTRY_RELEASE      optional
//
// What is captured, per request:
//   - exceptions thrown out of the handler            (kind=unhandled)
//   - every console.error() made while handling it    (kind=logged) — this is
//     how the functions already record API, database, integration and job
//     failures they catch themselves
//   - any 5xx response that logged nothing            (kind=http_5xx)
//
// What is never sent: request/response bodies, headers, query strings, and any
// non-Error object passed to console.error (those are provider responses,
// token payloads and database rows). Strings are scrubbed for emails, tokens
// and keys before leaving the function.

const DSN = Deno.env.get("SENTRY_DSN_EDGE") ?? Deno.env.get("SENTRY_DSN") ?? "";
const ENVIRONMENT = Deno.env.get("SENTRY_ENVIRONMENT") ?? "production";
const RELEASE = Deno.env.get("SENTRY_RELEASE") ?? undefined;

const MAX_EVENTS_PER_REQUEST = 5;
const SEND_TIMEOUT_MS = 2000;

interface ParsedDsn {
  envelopeUrl: string;
  publicKey: string;
}

export function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!url.username || !projectId) return null;
    return {
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

const target = DSN ? parseDsn(DSN) : null;

export const sentryEnabled = target !== null;

// ── Scrubbing ───────────────────────────────────────────────────────────────

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const PREFIXED_KEY =
  /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}|\bwhsec_[A-Za-z0-9]{8,}|\bsb_(secret|publishable)_[A-Za-z0-9_-]{8,}|\bre_[A-Za-z0-9_]{16,}|\bEAA[A-Za-z0-9]{20,}|\bya29\.[A-Za-z0-9._-]{20,}|\bAIza[A-Za-z0-9_-]{20,}|\bAC[a-f0-9]{32}\b/g;
const LONG_HEX = /\b[a-f0-9]{32,}\b/gi;
const CARD_LIKE = /\b\d(?:[ -]?\d){12,18}\b/g;
const PHONE = /\+\d[\d ]{7,14}\d/g;
const URL_QUERY = /(https?:\/\/[^\s?#"']+)[?#][^\s"']*/g;

export function scrubString(value: string): string {
  return value
    .replace(URL_QUERY, "$1")
    .replace(JWT, "[jwt]")
    .replace(BEARER, "$1 [token]")
    .replace(PREFIXED_KEY, "[key]")
    .replace(EMAIL, "[email]")
    .replace(LONG_HEX, "[hex]")
    .replace(CARD_LIKE, "[number]")
    .replace(PHONE, "[phone]")
    .slice(0, 500);
}

// ── Business module per function ────────────────────────────────────────────

const MODULES: Array<[RegExp, string]> = [
  [/^(stripe-payment-webhook|create-invoice-checkout)$/, "payments"],
  [/^(create-checkout|customer-portal|check-subscription)$/, "billing"],
  [/^(dinero|economic|accounting)-/, "invoices"],
  [/^(process-campaign-email-jobs|process-email-queue|email-provider-webhook|email-track|verify-emails)$/, "bulk_email"],
  [/^gmail-/, "email_sync"],
  [/^ai-email-writer$/, "email"],
  [/^meta-/, "meta_ads"],
  [/^(lead-|csv-import-leads|icp-score|cvr-search|companies-house-search|registry-ai-analyze)/, "leads"],
  [/^deal-coach$/, "deals"],
  [/^(voice-|phone-|generate-call-script)/, "voice"],
  [/^(workflow-|autopilot-|webhook-dispatch)/, "workflows"],
  [/^(composio-integration|mcp-server)$/, "integrations"],
  [/^admin-data$/, "admin"],
  [/^(ai-|chat$|smart-assistant$|meeting-summary$)/, "ai"],
];

// Functions that run as queue drains / scheduled syncs rather than user requests.
const BACKGROUND_JOBS = new Set([
  "workflow-runner",
  "process-email-queue",
  "process-campaign-email-jobs",
  "gmail-sync",
  "meta-sync",
  "dinero-sync",
  "economic-sync",
  "webhook-dispatch",
  "autopilot-agent",
  "autopilot-execute",
]);

export function moduleForFunction(name: string): string {
  for (const [pattern, module] of MODULES) if (pattern.test(name)) return module;
  return "other";
}

// ── Event construction ──────────────────────────────────────────────────────

type Kind = "unhandled" | "logged" | "http_5xx";

interface PendingEvent {
  kind: Kind;
  type: string;
  message: string;
  stack?: string;
  level: "error" | "fatal";
}

interface RequestState {
  fn: string;
  method: string;
  path: string;
  events: PendingEvent[];
  recorded: number;
  dropped: number;
  status?: number;
  finished: boolean;
}

interface Frame {
  function?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
}

// V8 stack → Sentry frames (oldest first, as the protocol expects).
export function parseStack(stack: string | undefined): Frame[] {
  if (!stack) return [];
  const frames: Frame[] = [];
  for (const line of stack.split("\n")) {
    const match = line.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/);
    if (!match) continue;
    const [, fn, file, lineno, colno] = match;
    const filename = file.replace(/^file:\/\/.*?\/functions\//, "functions/").replace(/[?#].*$/, "");
    frames.push({
      function: fn,
      filename,
      lineno: Number(lineno),
      colno: Number(colno),
      in_app: !/^(https?:|ext:|node:|npm:|jsr:)/.test(filename) && !filename.endsWith("_shared/sentry.ts"),
    });
  }
  return frames.reverse();
}

function eventId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function buildEvent(state: RequestState, pending: PendingEvent): Record<string, unknown> {
  const frames = parseStack(pending.stack);
  return {
    event_id: eventId(),
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: pending.level,
    logger: "supabase-edge",
    environment: ENVIRONMENT,
    release: RELEASE,
    transaction: state.fn,
    tags: {
      function: state.fn,
      module: moduleForFunction(state.fn),
      kind: pending.kind,
      runtime: "supabase-edge",
      background_job: String(BACKGROUND_JOBS.has(state.fn)),
      http_method: state.method,
      ...(state.status !== undefined ? { http_status: String(state.status) } : {}),
    },
    exception: {
      values: [{
        type: pending.type,
        value: pending.message,
        mechanism: { type: pending.kind === "unhandled" ? "onunhandled" : "generic", handled: pending.kind !== "unhandled" },
        ...(frames.length ? { stacktrace: { frames } } : {}),
      }],
    },
    // Path only — never the query string, headers or body.
    request: { method: state.method, url: state.path },
    extra: state.dropped ? { events_dropped_for_request: state.dropped } : undefined,
    // Group identical failures of one function together, apart from other functions.
    fingerprint: [state.fn, pending.kind, pending.type, pending.message.replace(/\d+/g, "N")],
  };
}

async function send(event: Record<string, unknown>): Promise<void> {
  if (!target) return;
  const envelope = [
    JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString(), dsn: DSN }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
  try {
    const res = await fetch(target.envelopeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_client=crater-edge/1.0, sentry_key=${target.publicKey}`,
      },
      body: envelope,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    await res.body?.cancel();
  } catch {
    // Monitoring must never affect the function. Drop the event.
  }
}

// Keep the isolate alive for the upload without delaying the response.
function background(promise: Promise<unknown>): Promise<unknown> | undefined {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(promise);
    return undefined;
  }
  return promise;
}

function describeThrown(value: unknown): { type: string; message: string; stack?: string } {
  if (value instanceof Error) {
    return { type: value.name || "Error", message: scrubString(value.message || "(no message)"), stack: value.stack };
  }
  if (value && typeof value === "object") {
    // PostgrestError and similar: keep message + code, drop `details`/`hint`
    // (Postgres echoes row values there).
    const v = value as { message?: unknown; code?: unknown };
    const code = typeof v.code === "string" ? `(${v.code})` : "";
    return {
      type: `NonError${code}`,
      message: scrubString(typeof v.message === "string" ? v.message : "(object thrown)"),
    };
  }
  return { type: "NonError", message: scrubString(String(value)) };
}

// ── Request-scoped console.error capture ────────────────────────────────────

interface Storage<T> {
  run<R>(store: T, fn: () => R): R;
  getStore(): T | undefined;
}

let storage: Storage<RequestState> | null = null;
if (sentryEnabled) {
  try {
    const { AsyncLocalStorage } = await import("node:async_hooks");
    storage = new AsyncLocalStorage<RequestState>();
  } catch {
    // Without request scoping, logged errors can't be attributed to a
    // request; thrown errors and 5xx responses are still reported.
    storage = null;
  }
}

function record(state: RequestState, pending: PendingEvent): void {
  if (state.recorded >= MAX_EVENTS_PER_REQUEST) {
    state.dropped++;
    return;
  }
  state.recorded++;
  if (state.finished) {
    // Logged after the response went out (streams, fire-and-forget work).
    background(send(buildEvent(state, pending)));
    return;
  }
  state.events.push(pending);
}

/**
 * Turns one console.error(...) call into an event. Only the leading label
 * string, numbers (status codes) and Error instances are used; every other
 * argument is ignored because it may hold provider payloads or row data.
 */
export function describeLogged(args: unknown[]): PendingEvent {
  const error = args.find((arg): arg is Error => arg instanceof Error);
  const label = typeof args[0] === "string" ? args[0] : "";
  const numbers = args.filter((arg): arg is number => typeof arg === "number");
  const object = error
    ? undefined
    : args.find((arg) => arg && typeof arg === "object") as { message?: unknown; code?: unknown } | undefined;

  const parts = [label.trim()];
  if (numbers.length) parts.push(numbers.join(" "));
  if (error) parts.push(error.message);
  else if (object && typeof object.message === "string") parts.push(object.message);
  if (object && typeof object.code === "string") parts.push(`(${object.code})`);

  return {
    kind: "logged",
    type: error?.name ?? "LoggedError",
    message: scrubString(parts.filter(Boolean).join(" ") || "(console.error)"),
    // No Error instance → capture where the log call was made instead.
    stack: error?.stack ?? new Error().stack?.split("\n").filter((line) => !line.includes("_shared/sentry.ts")).join("\n"),
    level: "error",
  };
}

if (sentryEnabled && storage) {
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    try {
      const state = storage?.getStore();
      if (state) record(state, describeLogged(args));
    } catch {
      // never let monitoring break logging
    }
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

type Handler<A extends unknown[]> = (req: Request, ...rest: A) => Response | Promise<Response>;

/**
 * Wraps a Deno.serve / std serve handler. The handler's Response is returned
 * untouched and anything it throws is re-thrown unchanged.
 */
export function withSentry<A extends unknown[]>(fn: string, handler: Handler<A>): Handler<A> {
  if (!sentryEnabled) return handler;

  return async (req: Request, ...rest: A): Promise<Response> => {
    let path = "/";
    try {
      path = new URL(req.url).pathname;
    } catch { /* keep default */ }
    const state: RequestState = { fn, method: req.method, path, events: [], recorded: 0, dropped: 0, finished: false };
    const run = () => handler(req, ...rest);

    try {
      const response = await (storage ? storage.run(state, run) : run());
      state.status = response.status;
      if (response.status >= 500 && state.events.length === 0) {
        state.events.push({
          kind: "http_5xx",
          type: "EdgeFunctionHttpError",
          message: `${fn} responded ${response.status}`,
          level: "error",
        });
      }
      flush(state);
      return response;
    } catch (thrown) {
      state.status = 500;
      // The unhandled exception is the event that matters most; make room for it.
      state.events.unshift({ kind: "unhandled", ...describeThrown(thrown), level: "fatal" });
      state.events.length = Math.min(state.events.length, MAX_EVENTS_PER_REQUEST);
      // Awaited: after a throw the runtime may tear the worker down at once.
      await flush(state, true);
      throw thrown;
    }
  };
}

function flush(state: RequestState, wait = false): Promise<unknown> | undefined {
  const pending = state.events.splice(0);
  state.finished = true;
  if (!pending.length) return undefined;
  const all = Promise.all(pending.map((event) => send(buildEvent(state, event))));
  return wait ? all : background(all);
}
