import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { loadTenantDefaults, loadThemeOverride, saveTenantDefaults, saveThemeOverride, TenantDefaults, ThemeMode } from '@/lib/tenant';
import type { Locale } from '@/lib/i18n';

type TenantContextValue = {
  tenant: TenantDefaults | null;
  userThemeOverride: ThemeMode | null;
  setTenantDefaults: (next: TenantDefaults) => void;
  setUserThemeOverride: (next: ThemeMode | null) => void;
  setTenantLanguage: (next: Locale) => void;
  setTenantTheme: (next: ThemeMode) => void;
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme();
  const [tenant, setTenant] = useState<TenantDefaults | null>(null);
  const [userThemeOverride, setUserThemeOverrideState] = useState<ThemeMode | null>(null);

  useEffect(() => {
    setTenant(loadTenantDefaults());
    setUserThemeOverrideState(loadThemeOverride());
  }, []);

  useEffect(() => {
    if (!tenant) return;
    const themeToApply = userThemeOverride || tenant.defaultTheme;
    setTheme(themeToApply);
  }, [tenant, userThemeOverride, setTheme]);

  const setTenantDefaults = (next: TenantDefaults) => {
    setTenant(next);
    saveTenantDefaults(next);
  };

  const setUserThemeOverride = (next: ThemeMode | null) => {
    setUserThemeOverrideState(next);
    saveThemeOverride(next);
  };

  const setTenantLanguage = (next: Locale) => {
    if (!tenant) return;
    const updated = { ...tenant, defaultLanguage: next };
    setTenantDefaults(updated);
  };

  const setTenantTheme = (next: ThemeMode) => {
    if (!tenant) return;
    const updated = { ...tenant, defaultTheme: next };
    setTenantDefaults(updated);
  };

  const value = useMemo(
    () => ({
      tenant,
      userThemeOverride,
      setTenantDefaults,
      setUserThemeOverride,
      setTenantLanguage,
      setTenantTheme,
    }),
    [tenant, userThemeOverride]
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return context;
}
