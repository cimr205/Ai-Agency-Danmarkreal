// Loads the Leadfeeder tracker, but only once, and only after the user has
// actually consented to analytics cookies — it must never fire before consent.
const LEADFEEDER_SCRIPT_ID = 'ldfdr-script';

export function loadLeadfeeder() {
  if (document.getElementById(LEADFEEDER_SCRIPT_ID)) return;

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

// Google Analytics 4 (property 533214056, aiagencydanmark.dk). Same rule as Leadfeeder:
// nothing loads, and no cookie is set, until the visitor has consented to analytics.
// VITE_GA_MEASUREMENT_ID overrides the ID; set it to "off" to disable GA entirely.
export const GA_MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined) || 'G-6L5R8WZTQ6';
const GA_SCRIPT_ID = 'ga4-script';

type GtagWindow = typeof window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

export function loadGoogleAnalytics(opts: { marketing: boolean }) {
  if (!/^G-[A-Z0-9]{4,}$/.test(GA_MEASUREMENT_ID)) return;
  const w = window as GtagWindow;
  if (!w.gtag) {
    w.dataLayer = w.dataLayer || [];
    // gtag.js reads the `arguments` object, so this must be a function expression, not a rest-args arrow.
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      (w.dataLayer as unknown[]).push(arguments);
    };
  }
  // Consent Mode v2: analytics granted (that is why we are here); ads only with marketing consent.
  w.gtag('consent', 'update', {
    analytics_storage: 'granted',
    ad_storage: opts.marketing ? 'granted' : 'denied',
    ad_user_data: opts.marketing ? 'granted' : 'denied',
    ad_personalization: opts.marketing ? 'granted' : 'denied',
  });
  if (document.getElementById(GA_SCRIPT_ID)) return;
  w.gtag('js', new Date());
  w.gtag('config', GA_MEASUREMENT_ID);
  const script = document.createElement('script');
  script.id = GA_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}
