// Pipeline constants and utilities

export const PIPELINE_STAGES = [
  { key: 'new', labelKey: 'new', color: 'hsl(221 83% 53%)' },
  { key: 'contacted', labelKey: 'contacted', color: 'hsl(38 92% 50%)' },
  { key: 'qualified', labelKey: 'qualified', color: 'hsl(142 76% 36%)' },
  { key: 'unqualified', labelKey: 'unqualified', color: 'hsl(0 84% 60%)' },
  { key: 'customer', labelKey: 'customer', color: 'hsl(262 80% 55%)' },
] as const;

const STAGE_LABELS: Record<string, Record<string, string>> = {
  en: { new: 'New Lead', contacted: 'Contacted', qualified: 'Qualified', unqualified: 'Unqualified', customer: 'Customer' },
  da: { new: 'Nyt Lead', contacted: 'Kontaktet', qualified: 'Kvalificeret', unqualified: 'Ikke Kvalificeret', customer: 'Kunde' },
  de: { new: 'Neuer Lead', contacted: 'Kontaktiert', qualified: 'Qualifiziert', unqualified: 'Nicht Qualifiziert', customer: 'Kunde' },
};

export function getStageLabel(key: string, locale: string = 'da'): string {
  return STAGE_LABELS[locale]?.[key] || STAGE_LABELS.en[key] || key;
}

export type PipelineStage = typeof PIPELINE_STAGES[number]['key'];

export const DKK_TO_USD = 0.145;
export const USD_TO_DKK = 1 / DKK_TO_USD;

export function convertCurrency(amount: number, from: 'DKK' | 'USD', to: 'DKK' | 'USD'): number {
  if (from === to) return amount;
  return from === 'DKK' ? amount * DKK_TO_USD : amount * USD_TO_DKK;
}

export function formatCurrency(amount: number, currency: 'DKK' | 'USD'): string {
  if (currency === 'DKK') {
    return new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(amount);
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
}

export function daysSince(date: string | null | undefined): number | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export interface PipelineLead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company_name?: string;
  status: PipelineStage;
  score: number;
  value: number;
  currency: string;
  owner_id?: string;
  owner_name?: string;
  notes?: string;
  last_touched_at?: string;
  next_followup_at?: string;
  ai_recommendation?: string;
  ai_recommendation_at?: string;
  created_at?: string;
  updated_at?: string;
}
