// Regression tests for bugs found in the 28.10.2026 QA rounds, so CI fails
// if one of them comes back.
import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import da from '@/messages/da.json';
import de from '@/messages/de.json';
import { splitLocalePath } from '@/components/SeoManager';
import { invalidRecipient } from '@/lib/autopilot/recipients';
import { dateLocaleTag, tl } from '@/lib/inlineI18n';
import { canMarkDealWon } from '@/lib/deals/wonValidation';

type Tree = { [k: string]: string | Tree };
function flatKeys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [prefix + k] : flatKeys(v as Tree, `${prefix}${k}.`));
}

describe('translations', () => {
  const enKeys = flatKeys(en as Tree);

  it.each([['da', da], ['de', de]])('%s has every English key', (_lang, messages) => {
    const keys = new Set(flatKeys(messages as Tree));
    expect(enKeys.filter(k => !keys.has(k))).toEqual([]);
  });

  it('German falls back to English, never Danish', () => {
    expect(tl('de', 'Dansk tekst der ikke findes', 'English text not in dict')).toBe('English text not in dict');
    expect(tl('da', 'Hej', 'Hello')).toBe('Hej');
  });

  it('date locale follows the app locale', () => {
    expect(dateLocaleTag('da')).toBe('da-DK');
    expect(dateLocaleTag('de')).toBe('de-DE');
    expect(dateLocaleTag('en')).toBe('en-GB');
  });
});

describe('SEO locale prefix (#115)', () => {
  it('strips the /de prefix so app pages are not "page not found"', () => {
    expect(splitLocalePath('/de/app/marketing/studio')).toEqual({ htmlLang: 'de', locale: 'en', suffix: '/app/marketing/studio' });
  });
  it('handles da, en and bare locale roots', () => {
    expect(splitLocalePath('/da/privacy').suffix).toBe('/privacy');
    expect(splitLocalePath('/en').suffix).toBe('/');
    expect(splitLocalePath('/da').locale).toBe('da');
  });
  it('does not eat a path that only starts with the same letters', () => {
    expect(splitLocalePath('/demo').suffix).toBe('/demo');
  });
});

describe('Autopilot recipients (#109)', () => {
  it('flags AI placeholder addresses', () => {
    expect(invalidRecipient({ to: 'leverandør@firma.dk' })).toBe('leverandør@firma.dk');
    expect(invalidRecipient({ recipient: 'kunde@example.com' })).toBe('kunde@example.com');
    expect(invalidRecipient({ to: 'not-an-email' })).toBe('not-an-email');
  });
  it('accepts real addresses and ignores non-recipient fields', () => {
    expect(invalidRecipient({ to: 'info@aiagencydanmark.dk', subject: 'x@firma.dk' })).toBeNull();
    expect(invalidRecipient({ cc: ['a@kunde.dk', 'b@kunde.dk'] })).toBeNull();
    expect(invalidRecipient(null)).toBeNull();
  });
  it('checks every address in a list', () => {
    expect(invalidRecipient({ to: 'a@kunde.dk, b@firma.dk' })).toBe('b@firma.dk');
  });
});

describe('deal won rule', () => {
  it('needs a customer and a close date not before creation', () => {
    expect(canMarkDealWon({ customer_id: 'c', expected_close_date: '2026-11-01', created_at: '2026-10-28T10:00:00Z' })).toBe(true);
    expect(canMarkDealWon({ customer_id: 'c', expected_close_date: '2020-01-01', created_at: '2026-10-28T10:00:00Z' })).toBe(false);
    expect(canMarkDealWon({ customer_id: null, expected_close_date: '2026-11-01' })).toBe(false);
  });
});
