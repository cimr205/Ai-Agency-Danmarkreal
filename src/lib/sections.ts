import type { ModuleKey } from '@/hooks/api/useModuleAccess';

export type SectionId = 'home' | 'crm' | 'marketing' | 'finance' | 'hr' | 'control';

export interface SectionDef {
  id: SectionId;
  /** Module that gates the section; null = always visible. */
  module: ModuleKey | null;
  labelKey: string;
  /** Route (relative to /:locale/app) of the section's dashboard. */
  dashboardPath: string;
  /** Route prefixes that belong to the section. A trailing "/" matches everything below it. */
  prefixes: string[];
  accent: string;
}

export const SECTIONS: SectionDef[] = [
  { id: 'home', module: null, labelKey: 'nav.home', dashboardPath: 'dashboard', prefixes: ['dashboard', 'clients', 'work/', 'email/emails'], accent: '#C7CDD6' },
  { id: 'crm', module: 'crm', labelKey: 'nav.crm', dashboardPath: 'crm/dashboard', prefixes: ['crm/'], accent: '#5B8DEF' },
  { id: 'marketing', module: 'marketing', labelKey: 'nav.marketing', dashboardPath: 'marketing/dashboard', prefixes: ['marketing/', 'email/bulk', 'email/templates', 'ai/media'], accent: '#A78BFA' },
  { id: 'finance', module: 'finance', labelKey: 'nav.finance', dashboardPath: 'finance/dashboard', prefixes: ['finance/'], accent: '#34D399' },
  { id: 'hr', module: 'hr', labelKey: 'nav.hr', dashboardPath: 'hr/dashboard', prefixes: ['hr/'], accent: '#F6B44D' },
  { id: 'control', module: 'system', labelKey: 'nav.controlRoom', dashboardPath: 'workspace/control-room', prefixes: ['workspace/', 'autopilot', 'pa', 'settings/', 'help'], accent: '#22D3EE' },
];

function matches(rel: string, prefix: string): boolean {
  const bare = prefix.replace(/\/$/, '');
  return rel === bare || rel.startsWith(bare + '/');
}

/** Path relative to /:locale/app, without query string or trailing slash. */
export function relativeAppPath(pathname: string): string {
  const idx = pathname.indexOf('/app/');
  const rel = idx >= 0 ? pathname.slice(idx + 5) : pathname.endsWith('/app') ? '' : pathname.replace(/^\//, '');
  return rel.replace(/\/+$/, '');
}

/** The section is always derived from the URL, so deep links, refresh and back button just work. */
export function sectionFromPath(pathname: string): SectionId {
  const rel = relativeAppPath(pathname);
  for (const section of SECTIONS) {
    if (section.id === 'home') continue;
    if (section.prefixes.some(p => matches(rel, p))) return section.id;
  }
  return 'home';
}
