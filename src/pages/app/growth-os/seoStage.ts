// SEO autopilot pipeline steps, and which one a running round is on (read
// from the log lines the Growth OS service writes, seo/autopilot.ts).
export const STAGES = [
  { icon: '🕷️', key: 'crawl' }, { icon: '🧭', key: 'plan' }, { icon: '✍️', key: 'write' }, { icon: '🔎', key: 'review' }, { icon: '📥', key: 'queue' },
] as const;

/** Which step the running round is on, read from its log (-1 when unknown). */
export function inferStage(log: string[]): number {
  for (let i = log.length - 1; i >= 0; i--) {
    const line = log[i];
    if (/Review af ".*": score/.test(line)) return 4;
    if (/gemt; sendes til review|Review udsat/.test(line)) return 3;
    if (/Udfører opgave/.test(line)) return 2;
    if (/Planlagde \d+|Planlægning/.test(line)) return 1;
    if (/Crawler|Crawl færdig/.test(line)) return 0;
  }
  return -1;
}

