// Shared stage config/labels/colors — extracted from the near-identical
// copies that used to live separately in PipelinePage.tsx and DealsPage.tsx.

export type StageDef = { key: string; label: string; color: string };

export const DEFAULT_STAGE_DEFS = [
  { name: 'Discovery', color: '#3B82F6' },
  { name: 'Proposal', color: '#F59E0B' },
  { name: 'Negotiation', color: '#8B5CF6' },
  { name: 'Won', color: '#22C55E' },
  { name: 'Lost', color: '#EF4444' },
];

export const stageLabels: Record<string, Record<string, string>> = {
  en: { discovery: 'Discovery', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' },
  da: { discovery: 'Opdagelse', proposal: 'Tilbud', negotiation: 'Forhandling', won: 'Vundet', lost: 'Tabt' },
  de: { discovery: 'Entdeckung', proposal: 'Angebot', negotiation: 'Verhandlung', won: 'Gewonnen', lost: 'Verloren' },
};

export const stageColors: Record<string, string> = {
  discovery: 'bg-primary/15 text-primary border-primary/30',
  proposal: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30',
  negotiation: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
  won: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  lost: 'bg-destructive/15 text-destructive border-destructive/30',
};

export const normalizeStageKey = (stage?: string | null) => stage?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';

export function buildStages(
  customStages: { name: string; color: string | null }[] | undefined,
  locale: string,
): StageDef[] {
  if (customStages && customStages.length > 0) {
    return customStages.map(s => {
      const key = normalizeStageKey(s.name);
      return { key, label: stageLabels[locale]?.[key] || s.name, color: s.color || '#3B82F6' };
    });
  }
  return DEFAULT_STAGE_DEFS.map(s => ({
    key: s.name.toLowerCase(),
    label: stageLabels[locale]?.[s.name.toLowerCase()] || s.name,
    color: s.color,
  }));
}

export function getStageLabelFor(
  stage: string,
  locale: string,
  customStages?: { name: string }[],
): string {
  const customStage = customStages?.find(s => normalizeStageKey(s.name) === stage);
  if (customStage) return customStage.name;
  return stageLabels[locale]?.[stage] || stageLabels.en[stage] || stage;
}
