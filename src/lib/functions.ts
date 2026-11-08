import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import type { FunctionInvokeOptions } from '@supabase/functions-js';
import { supabase } from '@/integrations/supabase/client';

export type AppErrorKind = 'http' | 'relay' | 'network' | 'unknown';

export interface AppErrorInput {
  functionName: string;
  status?: number;
  code?: string;
  serverMessage?: string;
  hint?: string;
  requestId?: string;
  kind: AppErrorKind;
  /** The full parsed JSON error body, for call sites that need a custom field beyond error/code/hint. */
  body?: Record<string, unknown>;
}

/**
 * Thrown by invokeFunction for every edge-function failure, with enough
 * structure (status, server-provided message, request id) for explainError()
 * to build an honest, non-jargon message instead of the SDK's generic
 * "Edge Function returned a non-2xx status code".
 */
export class AppError extends Error {
  functionName: string;
  status?: number;
  code?: string;
  serverMessage?: string;
  hint?: string;
  requestId?: string;
  kind: AppErrorKind;
  timestamp: string;
  /** The full parsed JSON error body, for call sites that need a custom field beyond error/code/hint. */
  body?: Record<string, unknown>;

  constructor(input: AppErrorInput) {
    super(input.serverMessage || `${input.functionName} failed (${input.kind})`);
    this.name = 'AppError';
    this.functionName = input.functionName;
    this.status = input.status;
    this.code = input.code;
    this.serverMessage = input.serverMessage;
    this.hint = input.hint;
    this.requestId = input.requestId;
    this.kind = input.kind;
    this.body = input.body;
    this.timestamp = new Date().toISOString();
  }
}

interface ParsedErrorBody {
  error?: string;
  code?: string;
  hint?: string;
  requestId?: string;
  body?: Record<string, unknown>;
}

async function parseErrorBody(response: Response | undefined): Promise<ParsedErrorBody> {
  if (!response) return {};
  try {
    const clone = typeof response.clone === 'function' ? response.clone() : response;
    const json: unknown = await clone.json();
    if (json && typeof json === 'object') {
      const body = json as Record<string, unknown>;
      return {
        error: typeof body.error === 'string' ? body.error : undefined,
        code: typeof body.code === 'string' ? body.code : undefined,
        hint: typeof body.hint === 'string' ? body.hint : undefined,
        requestId:
          typeof body.requestId === 'string'
            ? body.requestId
            : typeof body.request_id === 'string'
              ? body.request_id
              : undefined,
        body,
      };
    }
  } catch {
    // Response body wasn't JSON (or was already consumed) — fall through.
  }
  return {};
}

function requestIdFromHeaders(response: Response | undefined): string | undefined {
  return response?.headers?.get('x-request-id') ?? undefined;
}

/**
 * Invokes a Supabase edge function and throws a structured AppError on
 * failure instead of returning the SDK's opaque FunctionsHttpError /
 * FunctionsRelayError / FunctionsFetchError. This is the only place in the
 * app allowed to call supabase.functions.invoke directly (enforced by an
 * ESLint rule) so every call site gets the same error handling for free.
 */
export async function invokeFunction<T = unknown>(
  name: string,
  options?: FunctionInvokeOptions,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, options);

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const response = error.context as Response | undefined;
      const body = await parseErrorBody(response);
      throw new AppError({
        functionName: name,
        status: response?.status,
        code: body.code,
        serverMessage: body.error,
        hint: body.hint,
        requestId: body.requestId ?? requestIdFromHeaders(response),
        kind: 'http',
        body: body.body,
      });
    }

    if (error instanceof FunctionsRelayError) {
      const response = error.context as Response | undefined;
      throw new AppError({
        functionName: name,
        status: response?.status,
        requestId: requestIdFromHeaders(response),
        kind: 'relay',
      });
    }

    if (error instanceof FunctionsFetchError) {
      throw new AppError({
        functionName: name,
        kind: 'network',
      });
    }

    throw new AppError({
      functionName: name,
      serverMessage: error instanceof Error ? error.message : undefined,
      kind: 'unknown',
    });
  }

  return data as T;
}
