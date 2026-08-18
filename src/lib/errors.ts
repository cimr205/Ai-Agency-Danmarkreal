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
