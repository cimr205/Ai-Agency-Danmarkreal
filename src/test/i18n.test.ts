import { describe, it, expect } from 'vitest';
import { isLocale, SUPPORTED_LOCALES } from '@/lib/i18n';

describe('i18n utilities', () => {
  it('isLocale returns true for supported locales', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('da')).toBe(true);
    expect(isLocale('de')).toBe(true);
  });

  it('isLocale returns false for unsupported values', () => {
    expect(isLocale('fr')).toBe(false);
    expect(isLocale('')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });

  it('SUPPORTED_LOCALES has correct entries', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'da', 'de']);
  });
});
