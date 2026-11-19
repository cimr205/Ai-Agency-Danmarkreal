/**
 * Supabase auth errors come back as raw English strings from GoTrue.
 * Map the common ones to translated copy instead of leaking English text
 * into a Danish/German UI; anything unrecognized falls back to a generic message.
 */
export function describeAuthError(err: unknown, t: (key: string) => string): string {
  const message = err instanceof Error ? err.message : '';
  const lower = message.toLowerCase();

  if (lower.includes('email not confirmed')) return t('auth.emailNotConfirmed');
  if (lower.includes('invalid login credentials')) return t('auth.invalidCredentials');
  if (lower.includes('user already registered') || lower.includes('already registered')) return t('auth.emailAlreadyRegistered');
  if (lower.includes('password') && (lower.includes('weak') || lower.includes('at least') || lower.includes('should contain'))) return t('auth.passwordTooWeak');
  if (lower.includes('rate limit') || lower.includes('too many requests')) return t('auth.tooManyRequests');
  if (lower.includes('failed to fetch') || lower.includes('network')) return t('auth.networkError');

  return message || t('auth.unknownError');
}
