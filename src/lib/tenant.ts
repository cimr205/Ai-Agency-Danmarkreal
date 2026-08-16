import type { Locale } from '@/lib/i18n';

export type ThemeMode = 'light' | 'dark';

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
  const raw = localStorage.getItem(THEME_OVERRIDE_KEY);
  if (raw === 'light' || raw === 'dark') return raw;
  return null;
}

export function saveThemeOverride(next: ThemeMode | null): void {
  if (next === null) {
    localStorage.removeItem(THEME_OVERRIDE_KEY);
  } else {
    localStorage.setItem(THEME_OVERRIDE_KEY, next);
  }
}
