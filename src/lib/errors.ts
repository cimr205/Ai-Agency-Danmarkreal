import { AppError, type AppErrorKind } from '@/lib/functions';
import { getLocaleFromPath, translate, type Locale } from '@/lib/i18n';
import { FUNCTION_AREA_TRANSLATION_KEYS, getFunctionAreaName } from '@/lib/functionRegistry';

/**
 * Supabase RPC errors (PostgrestError) are plain objects, not Error instances,
 * so `err instanceof Error ? err.message : fallback` always takes the fallback
 * branch for them and silently discards the real database error message.
 */
export function getErrorMessage(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return undefined;
}

/**
 * supabase.functions.invoke() only surfaces a generic "Edge Function
 * returned a non-2xx status code" for the `error` it returns — the real
 * { error: "..." } JSON body our edge functions send back has to be read
 * separately from error.context, or callers only ever see that generic
 * message instead of the actual reason (e.g. "no AI provider connected").
 */
export async function getFunctionErrorMessage(error: unknown): Promise<string | undefined> {
  const fallback = getErrorMessage(error);
  const ctx = (error as { context?: { json?: () => Promise<unknown> } } | undefined)?.context;
  try {
    const parsed = (await ctx?.json?.()) as { error?: string } | undefined;
    if (parsed?.error) return parsed.error;
  } catch {
    // ignore, fall back below
  }
  return fallback;
}

export interface ExplainedErrorDetails {
  functionName?: string;
  status?: number;
  code?: string;
  requestId?: string;
  timestamp: string;
}

export interface ExplainedError {
  title: string;
  message: string;
  details: ExplainedErrorDetails;
}

export interface ExplainErrorContext {
  /** Already-localized phrase describing the attempted action, e.g. "hente CVR-oplysninger". */
  action?: string;
  locale?: Locale;
}

type StatusBucket =
  | 'badRequest'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'conflict'
  | 'rateLimited'
  | 'serverError'
  | 'network'
  | 'unknown';

// Never let the SDK's own wording ("Edge Function returned a non-2xx status
// code") leak into a user-facing message, even when it arrives disguised as
// a server-provided message.
const BANNED_PHRASE = /edge function|non-2xx/i;

function sanitizeServerMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  const trimmed = message.trim();
  if (!trimmed || BANNED_PHRASE.test(trimmed)) return undefined;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function statusBucket(kind: AppErrorKind, status: number | undefined): StatusBucket {
  if (kind === 'network') return 'network';
  if (kind === 'relay') return 'serverError';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rateLimited';
  if (status !== undefined && status >= 500) return 'serverError';
  if (status === 400 || status === 422) return 'badRequest';
  return 'unknown';
}

function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

/**
 * Turns an AppError (or any other caught error) into an honest, specific,
 * non-technical message: "<what> (<area>): <why>. <what to do>." Never
 * surfaces "Edge Function", "non-2xx" or raw JSON as the headline message.
 */
export function explainError(err: unknown, context: ExplainErrorContext = {}): ExplainedError {
  const locale = context.locale ?? getLocaleFromPath();
  const t = (key: string) => translate(locale, key);
  const timestamp = new Date().toISOString();

  if (err instanceof AppError) {
    const areaKey = FUNCTION_AREA_TRANSLATION_KEYS[err.functionName];
    const area = areaKey ? t(`errors.functionAreas.${areaKey}`) : getFunctionAreaName(err.functionName);
    const bucket = statusBucket(err.kind, err.status);

    // Codes whose server message is written for the end user (e.g. CVR
    // lookup quota used up) are shown as-is instead of the generic
    // "something went wrong on our side" text.
    const userFacingCode = err.code === 'QUOTA_EXCEEDED' || err.code === 'AI_MODEL_UNAVAILABLE';
    const serverWhy = bucket === 'badRequest' || userFacingCode ? sanitizeServerMessage(err.serverMessage) : undefined;
    const why = serverWhy ?? t(`errors.status.${bucket}.why`);
    const what = err.hint ? (/[.!?]$/.test(err.hint) ? err.hint : `${err.hint}.`) : t(`errors.status.${bucket}.what`);

    const lead = context.action ? `${context.action} (${area})` : area;

    return {
      title: t('errors.generic.title'),
      message: `${capitalize(lead)}: ${why} ${what}`.trim(),
      details: {
        functionName: err.functionName,
        status: err.status,
        code: err.code,
        requestId: err.requestId,
        timestamp,
      },
    };
  }

  const fallbackMessage = sanitizeServerMessage(getErrorMessage(err));
  const lead = context.action ?? t('errors.generic.actionFallback');
  return {
    title: t('errors.generic.title'),
    message: `${capitalize(lead)}: ${fallbackMessage ?? t('errors.status.unknown.why')} ${t('errors.status.unknown.what')}`.trim(),
    details: { timestamp },
  };
}
