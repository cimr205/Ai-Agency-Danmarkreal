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
