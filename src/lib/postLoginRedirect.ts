// Remembers where a signed-out user was headed across the Google OAuth round
// trip (the redirect to Google and back loses react-router's location state).
// Only in-app paths are accepted, so a stored value can never send the user
// to another site or back to an auth page.

const KEY = 'post_login_redirect';
const APP_PATH = /^\/(en|da|de)\/app(\/[A-Za-z0-9\-_/]*)?(\?[^#]*)?(#.*)?$/;

export function isSafeAppPath(path: string | null | undefined): path is string {
  return !!path && APP_PATH.test(path) && !path.includes('//');
}

export function rememberPostLoginRedirect(path: string): void {
  try {
    if (isSafeAppPath(path)) sessionStorage.setItem(KEY, path);
    else sessionStorage.removeItem(KEY);
  } catch { /* storage blocked: fall back to the dashboard */ }
}

/** Returns the remembered path (once) or the fallback. */
export function takePostLoginRedirect(fallback: string): string {
  try {
    const path = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return isSafeAppPath(path) ? path : fallback;
  } catch {
    return fallback;
  }
}
