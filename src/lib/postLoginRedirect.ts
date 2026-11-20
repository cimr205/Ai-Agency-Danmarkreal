// Remembers where a signed-out user was headed across the Google OAuth round
// trip (the redirect to Google and back loses react-router's location state,
// and Supabase may send the user back to the site root instead of
// /auth/callback). Only in-app paths are accepted, so a stored value can never
// send the user to another site or back to an auth page. Entries expire after
// 15 minutes so an abandoned sign-in doesn't hijack a later visit.

const KEY = 'post_login_redirect';
const MAX_AGE_MS = 15 * 60_000;
const APP_PATH = /^\/(en|da|de)\/app(\/[A-Za-z0-9\-_/]*)?(\?[^#]*)?(#.*)?$/;

export function isSafeAppPath(path: string | null | undefined): path is string {
  return !!path && APP_PATH.test(path) && !path.includes('//');
}

export function rememberPostLoginRedirect(path: string, now = Date.now()): void {
  try {
    if (isSafeAppPath(path) && !/^\/(en|da|de)\/app\/dashboard\/?$/.test(path)) {
      localStorage.setItem(KEY, JSON.stringify({ path, at: now }));
    }
  } catch { /* storage blocked: fall back to the dashboard */ }
}

/** Returns the remembered path (once) or the fallback. */
export function takePostLoginRedirect(fallback: string, now = Date.now()): string {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return fallback;
    const { path, at } = JSON.parse(raw) as { path?: string; at?: number };
    return isSafeAppPath(path) && typeof at === 'number' && now - at >= 0 && now - at < MAX_AGE_MS ? path : fallback;
  } catch {
    return fallback;
  }
}
