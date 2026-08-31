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
