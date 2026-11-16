// Optional, consent-based tracking (GA4 and Leadfeeder) plus redaction for the
// cookieless Vercel Web Analytics. Rules:
//  - nothing optional loads, and no tracking cookie is set, before the visitor
//    has consented to analytics cookies (CookieConsent decides when to call these);
//  - nothing is sent from private areas (/app, /auth): GA4 is switched off there
//    and Leadfeeder is never started on those pages;
//  - withdrawing consent stops GA4 at once, removes its cookies and reloads the
//    page if a tracker already ran, so no script keeps running in memory.

// ── private routes ─────────────────────────────────────────────────────────
/** CRM workspaces and auth flows. URLs there can carry customer record ids. */
export function isPrivatePath(pathname: string): boolean {
  return /^\/(?:[a-z]{2}\/)?(?:app|auth)(?:\/|$)/.test(pathname);
}

// ── Leadfeeder ─────────────────────────────────────────────────────────────
export const LEADFEEDER_SCRIPT_ID = 'ldfdr-script';

export function loadLeadfeeder() {
  if (document.getElementById(LEADFEEDER_SCRIPT_ID)) return;
  if (isPrivatePath(window.location.pathname)) return;

  const w = window as typeof window & { ldfdr?: (...args: unknown[]) => void; ldfdr_q?: unknown[] };
  w.ldfdr = w.ldfdr || function (...args: unknown[]) {
    (w.ldfdr_q = w.ldfdr_q || []).push(args);
  };

  const script = document.createElement('script');
  script.id = LEADFEEDER_SCRIPT_ID;
  script.async = true;
  script.src = 'https://sc.lfeeder.com/lftracker_v1_DzLR5a51mrZaBoQ2.js';
  document.head.appendChild(script);
}

// ── Google Analytics 4 ─────────────────────────────────────────────────────
// Property 533214056 (aiagencydanmark.dk). The measurement ID is public by design.
// VITE_GA4_MEASUREMENT_ID overrides it; "off" disables GA4.
export const GA4_MEASUREMENT_ID = (import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined) || 'G-6L5R8WZTQ6';
export const GA4_SCRIPT_ID = 'ga4-script';
const VALID_ID = /^G-[A-Z0-9]{4,}$/;

type GtagWindow = typeof window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } & Record<string, unknown>;

function gtag(...args: unknown[]) {
  const w = window as GtagWindow;
  if (!w.gtag) {
    w.dataLayer = w.dataLayer || [];
    // gtag.js reads the `arguments` object, so this must stay a function expression.
    w.gtag = function gtagShim() {
      // eslint-disable-next-line prefer-rest-params
      (w.dataLayer as unknown[]).push(arguments);
    };
  }
  w.gtag(...args);
}

/** Blocks every GA4 hit while true (gtag checks this flag before each hit). */
function setGA4Disabled(disabled: boolean) {
  if (VALID_ID.test(GA4_MEASUREMENT_ID)) (window as GtagWindow)[`ga-disable-${GA4_MEASUREMENT_ID}`] = disabled;
}

/** Call on every route change: GA4 sends nothing from private pages. */
export function applyGA4RoutePolicy(pathname: string) {
  if (document.getElementById(GA4_SCRIPT_ID)) setGA4Disabled(isPrivatePath(pathname));
}

export function loadGA4(opts: { marketing: boolean }) {
  if (!VALID_ID.test(GA4_MEASUREMENT_ID)) return;
  setGA4Disabled(isPrivatePath(window.location.pathname));
  // Consent Mode v2: analytics granted (that is why we are here); ads only with marketing consent.
  gtag('consent', 'update', {
    analytics_storage: 'granted',
    ad_storage: opts.marketing ? 'granted' : 'denied',
    ad_user_data: opts.marketing ? 'granted' : 'denied',
    ad_personalization: opts.marketing ? 'granted' : 'denied',
  });
  if (document.getElementById(GA4_SCRIPT_ID)) return;
  gtag('js', new Date());
  gtag('config', GA4_MEASUREMENT_ID);
  const script = document.createElement('script');
  script.id = GA4_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

/** Removes first-party GA cookies (_ga, _ga_<id>) on this host and its parent domains. */
function deleteGACookies() {
  const names = document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => n === '_ga' || n.startsWith('_ga_'));
  const parts = window.location.hostname.split('.');
  const domains = [''];
  for (let i = 0; i < parts.length - 1; i++) domains.push(`; domain=.${parts.slice(i).join('.')}`);
  for (const n of names) for (const d of domains) document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
}

/**
 * Withdrawal or rejection. Stops GA4 immediately, denies all consent signals and
 * deletes GA cookies. Returns true when a tracker script already ran in this page,
 * in which case the caller must reload so nothing keeps running in memory.
 */
export function withdrawAnalytics(): boolean {
  const ranGA = !!document.getElementById(GA4_SCRIPT_ID);
  const ranLf = !!document.getElementById(LEADFEEDER_SCRIPT_ID);
  if (ranGA) {
    setGA4Disabled(true);
    gtag('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  }
  deleteGACookies();
  return ranGA || ranLf;
}

// ── Vercel Web Analytics (cookieless) ──────────────────────────────────────
const ID_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{3,}|[A-Za-z0-9_-]{20,})$/i;

/**
 * Vercel records the URL of every page view. Record ids in CRM URLs are replaced
 * by ":id" and query strings are dropped, except utm_* campaign tags.
 */
export function redactAnalyticsUrl(url: string): string {
  try {
    const u = new URL(url);
    u.pathname = u.pathname.split('/').map((s) => (ID_SEGMENT.test(s) ? ':id' : s)).join('/');
    const keep = new URLSearchParams();
    u.searchParams.forEach((v, k) => { if (k.startsWith('utm_')) keep.set(k, v); });
    u.search = keep.toString();
    u.hash = '';
    return u.toString();
  } catch {
    return url;
  }
}
