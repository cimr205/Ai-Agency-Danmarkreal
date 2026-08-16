import React, { createContext, useContext, useMemo } from 'react';
import en from '@/messages/en.json';
import da from '@/messages/da.json';
import de from '@/messages/de.json';

export type Locale = 'en' | 'da' | 'de';

const LOCALES: Locale[] = ['en', 'da', 'de'];

export const SUPPORTED_LOCALES: Locale[] = LOCALES;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as string[]).includes(value);
}

const msgs: Record<Locale, Record<string, unknown>> = { en, da, de };

function getNestedValue(obj: Record<string, unknown>, path: string): string | null {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current === 'string') return current;
  return null;
}

/**
 * Resolve a translation key with automatic English fallback.
 * Never returns a raw key — always falls back to English, then to key with dots replaced by spaces.
 */
function resolve(locale: Locale, key: string): string {
  const dict = msgs[locale];
  const val = dict ? getNestedValue(dict, key) : null;
  if (val) return val;
  // Fallback to English
  if (locale !== 'en') {
    const enVal = getNestedValue(msgs.en, key);
    if (enVal) return enVal;
  }
  // Last resort: humanize the key (remove prefix, replace dots with spaces)
  const last = key.split('.').pop() || key;
  return last.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
}

interface I18nContextValue {
  locale: Locale;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  t: (key) => key,
});

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo<I18nContextValue>(() => ({
    locale,
    t: (key: string) => resolve(locale, key),
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
