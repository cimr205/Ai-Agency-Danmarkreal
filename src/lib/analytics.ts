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


// GA4 is optional. The measurement ID is public, but never load tracking
// until the visitor has explicitly opted in to analytics.
const GA4_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function loadGA4() {
  if (!GA4_ID || !/^G-[A-Z0-9]+$/.test(GA4_ID)) return;
  if (document.getElementById('ga4-script')) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = (...args: unknown[]) => { window.dataLayer?.push(args); };
  window.gtag('js', new Date());
  window.gtag('config', GA4_ID, { send_page_view: true });
  const script = document.createElement('script');
  script.id = 'ga4-script';
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_ID);
  document.head.appendChild(script);
}

// Stop GA4 collection immediately if consent is withdrawn. A page reload
// prevents an already-loaded Leadfeeder script from continuing to run.
export function disableGA4() {
  if (GA4_ID) (window as Window & Record<string, unknown>)['ga-disable-' + GA4_ID] = true;
}
