// Stored cookie choice. Shared by the banner, the footer/privacy "cookie settings"
// links and the tests.
export const COOKIE_KEY = 'cookie-consent';
export const CONSENT_ID_KEY = 'cookie-consent-id';
/** Bump when the cookie text or vendor list changes: stored consent from an older version is asked again. */
export const CONSENT_VERSION = '2026-11-17';
/** Opens the banner with the stored choices so consent can be changed or withdrawn. */
export const OPEN_COOKIE_SETTINGS = 'open-cookie-settings';

export interface ConsentState {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
  version?: string;
}

export function readStoredConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(COOKIE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    return parsed.version === CONSENT_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS));
}
