/**
 * Data scrubbing for everything that leaves the browser towards Sentry.
 *
 * Kept free of any Sentry import so it can be unit-tested in isolation and so
 * the rules are readable in one place. The CRM handles customer data, email
 * bodies, OAuth tokens and payment references — none of it may end up in an
 * error report, breadcrumb or span.
 */

const FILTERED = '[Filtered]';

// Keys whose values are never sent, whatever they contain.
const SENSITIVE_KEY =
  /pass(word|wd)?|secret|token|authori[sz]ation|api[-_]?key|apikey|cookie|session|credential|signature|card|cvc|cvv|iban|account[-_]?number|cpr|ssn|e[-_]?mail|phone|address|body|content|html|subject|snippet|message|prompt|payload/i;

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const JWT = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
// Provider key prefixes (Stripe, Supabase, Resend, Meta, Google, Twilio, …).
const PREFIXED_KEY =
  /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{8,}|\bwhsec_[A-Za-z0-9]{8,}|\bsb_(secret|publishable)_[A-Za-z0-9_-]{8,}|\bre_[A-Za-z0-9_]{16,}|\bEAA[A-Za-z0-9]{20,}|\bya29\.[A-Za-z0-9._-]{20,}|\bAIza[A-Za-z0-9_-]{20,}|\bAC[a-f0-9]{32}\b/g;
const LONG_HEX = /\b[a-f0-9]{32,}\b/gi;
// 13–19 digit runs (optionally space/dash separated) — payment card shaped.
const CARD_LIKE = /\b\d(?:[ -]?\d){12,18}\b/g;

export function scrubString(value: string): string {
  return value
    .replace(JWT, '[jwt]')
    .replace(BEARER, '$1 [token]')
    .replace(PREFIXED_KEY, '[key]')
    .replace(EMAIL, '[email]')
    .replace(LONG_HEX, '[hex]')
    .replace(CARD_LIKE, '[number]');
}

/**
 * Query strings and fragments carry OAuth codes, access tokens, invite codes
 * and PostgREST filters (`?email=eq.someone@…`). Only origin + path survive.
 */
export function scrubUrl(url: string): string {
  const cut = url.search(/[?#]/);
  return scrubString(cut === -1 ? url : url.slice(0, cut));
}

export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= 5) return '[Truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => scrubValue(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? FILTERED : scrubValue(inner, depth + 1);
  }
  return out;
}

// Breadcrumb/span attribute names that hold a URL or route (`url`, `http.url`,
// `url.full`, `from`, `to`, `sentry.source_url`, …).
const URL_KEY = /(^|[._])(url|uri|href|from|to|target|referrer|referer)([._]|$)/i;
// Never useful, always risky: raw query strings, fragments and bodies.
const DROPPED_KEY = /(^|[._])(query|fragment|body|request_body|response_body)([._]|$)/i;

/** Scrubs a breadcrumb/span `data` bag in place-safe fashion (returns a copy). */
export function scrubDataBag(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return data;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(data)) {
    if (DROPPED_KEY.test(key)) continue;
    if (URL_KEY.test(key) && typeof inner === 'string') out[key] = scrubUrl(inner);
    else if (SENSITIVE_KEY.test(key)) out[key] = FILTERED;
    else out[key] = scrubValue(inner, 1);
  }
  return out;
}

/** `GET https://x.supabase.co/rest/v1/customers?email=eq.a@b.dk` → without the query. */
export function scrubSpanDescription(description: string): string {
  const match = description.match(/^([A-Z]+\s+)?(\S+)(.*)$/s);
  if (!match) return scrubString(description);
  const [, method = '', target, rest] = match;
  return /^(https?:)?\/\//.test(target) || target.startsWith('/')
    ? `${method}${scrubUrl(target)}`
    : scrubString(`${method}${target}${rest}`);
}

/**
 * Maps the current route to the business module it belongs to, so every
 * event can be filtered per area in Sentry without tagging each call site.
 */
export function moduleFromPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  // Drop the locale prefix (`/da/app/...`).
  const rest = parts.length && /^[a-z]{2}$/.test(parts[0]) ? parts.slice(1) : parts;
  const [area, a, b] = rest;

  if (area === 'auth') return a === 'join' || a === 'join-company' ? 'invitations' : 'auth';
  if (area === 'admin') return 'admin';
  if (area !== 'app') return 'public';

  switch (a) {
    case 'crm':
      if (b === 'leads' || b === 'lead-generation' || b === 'icp') return 'leads';
      if (b === 'deals') return 'deals';
      return 'crm';
    case 'clients':
      return 'customers';
    case 'finance':
      if (b === 'invoices' || b === 'quotes') return 'invoices';
      if (b === 'payments') return 'payments';
      return 'finance';
    case 'subscription':
      return 'payments';
    case 'hr':
      return 'hr';
    case 'email':
      return b === 'bulk' ? 'bulk_email' : 'email';
    case 'work':
      return b === 'inbox' ? 'email' : 'work';
    case 'marketing':
      return b === 'meta-ads' ? 'meta_ads' : 'voice';
    case 'ai':
    case 'pa':
    case 'autopilot':
      return 'ai';
    case 'workspace':
      return b === 'connected-apps' ? 'integrations' : b === 'documents' ? 'documents' : 'ai';
    case 'settings':
      return b === 'invitations' ? 'invitations' : 'settings';
    case 'admin':
      return 'admin';
    default:
      return a ?? 'app';
  }
}

// Postgres / PostgREST codes that mean "the user did something the system
// correctly refused", not "the system is broken".
const EXPECTED_DB_CODES = new Set([
  '23505', // unique_violation
  '23503', // foreign_key_violation
  '23502', // not_null_violation
  '23514', // check_violation
  '22P02', // invalid_text_representation
  '22001', // string_data_right_truncation
  'P0001', // raise_exception — business rule raised by an RPC
  'P0002', // no_data_found
  '42501', // insufficient_privilege (RLS / role denial)
  'PGRST116', // .single() matched 0 or >1 rows
  'PGRST301', // JWT expired
]);

const EXPECTED_ERROR_NAMES = new Set([
  'AbortError',
  'ZodError',
  'AuthSessionMissingError',
  'AuthWeakPasswordError',
  'AuthInvalidCredentialsError',
]);

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const e = error as { status?: unknown; context?: { status?: unknown } };
  if (typeof e.status === 'number') return e.status;
  if (typeof e.context?.status === 'number') return e.context.status;
  return undefined;
}

/**
 * Validation failures, permission denials, bad credentials and other 4xx
 * outcomes are normal product behaviour and must not page anyone.
 */
export function isExpectedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: unknown; code?: unknown };
  if (typeof e.name === 'string' && EXPECTED_ERROR_NAMES.has(e.name)) return true;
  if (typeof e.code === 'string' && EXPECTED_DB_CODES.has(e.code)) return true;
  const status = statusOf(error);
  return status !== undefined && status >= 400 && status < 500;
}
