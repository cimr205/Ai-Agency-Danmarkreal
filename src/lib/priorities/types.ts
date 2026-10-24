export type Tier = 1 | 2 | 3;

export interface PriorityItem {
  id: string;
  tier: Tier;
  /** Higher = more important inside its tier. */
  score: number;
  title: string;
  detail: string;
  href: string;
  cta: string;
}

/** Translate a key, with optional {placeholder} values. */
export type Tr = (key: string, vars?: Record<string, string | number>) => string;

export function itemsInTier(items: PriorityItem[], tier: Tier): PriorityItem[] {
  return items.filter(i => i.tier === tier).sort((a, b) => b.score - a.score);
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

/** One sentence for the hero's signal panel: what to start with. */
export function signalNote(items: PriorityItem[], tr: Tr): { text: string; urgent: boolean } {
  const urgent = itemsInTier(items, 1);
  const today = itemsInTier(items, 2);
  if (urgent.length > 0) return { text: tr('sec.signal.urgent', { n: urgent.length, first: urgent[0].title }), urgent: true };
  if (today.length > 0) return { text: tr('sec.signal.today', { n: today.length, first: today[0].title }), urgent: false };
  return { text: tr('sec.signal.clear'), urgent: false };
}

export const MS_DAY = 86_400_000;
