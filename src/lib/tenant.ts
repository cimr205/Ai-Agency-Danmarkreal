import type { Locale } from '@/lib/i18n';

/** The three installed product themes. Legacy stored values ('light'/'dark')
 * are mapped forward by normalizeTheme so old preferences keep working. */
export type ThemeMode = 'daylight' | 'midnight' | 'graphite';

export const THEME_MODES: ThemeMode[] = ['midnight', 'daylight', 'graphite'];

const LEGACY_THEME: Record<string, ThemeMode> = { light: 'daylight', dark: 'midnight' };

export function normalizeTheme(value: string | null | undefined): ThemeMode | null {
  if (!value) return null;
  if (value === 'daylight' || value === 'midnight' || value === 'graphite') return value;
  return LEGACY_THEME[value] ?? null;
}

export interface TenantDefaults {
  tenantId: string;
  companyName: string;
  joinCode?: string;
  inviteCode?: string;
  defaultLanguage: Locale;
  defaultTheme: ThemeMode;
}

const TENANT_KEY = 'tenant_defaults';
const THEME_OVERRIDE_KEY = 'tenant_theme_override';

export function loadTenantDefaults(): TenantDefaults | null {
  try {
    const raw = localStorage.getItem(TENANT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TenantDefaults;
  } catch {
    return null;
  }
}

export function saveTenantDefaults(next: TenantDefaults): void {
  localStorage.setItem(TENANT_KEY, JSON.stringify(next));
}

export function loadThemeOverride(): ThemeMode | null {
  return normalizeTheme(localStorage.getItem(THEME_OVERRIDE_KEY));
}

export function saveThemeOverride(next: ThemeMode | null): void {
  if (next === null) {
    localStorage.removeItem(THEME_OVERRIDE_KEY);
  } else {
    localStorage.setItem(THEME_OVERRIDE_KEY, next);
  }
}
