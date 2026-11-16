import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyGA4RoutePolicy, GA4_MEASUREMENT_ID, isPrivatePath, loadGA4, loadLeadfeeder, redactAnalyticsUrl, withdrawAnalytics } from './analytics';

type W = typeof window & { dataLayer?: IArguments[]; gtag?: unknown } & Record<string, unknown>;
const w = window as W;
const flag = `ga-disable-${GA4_MEASUREMENT_ID}`;
const calls = () => (w.dataLayer ?? []).map((a) => Array.from(a));

function reset() {
  document.head.querySelectorAll('script').forEach((s) => s.remove());
  delete w.dataLayer; delete w.gtag; delete w[flag]; delete w.ldfdr;
  document.cookie.split(';').forEach((c) => { document.cookie = `${c.split('=')[0].trim()}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`; });
  window.history.replaceState(null, '', '/da');
}
beforeEach(reset);
afterEach(reset);

describe('GA4', () => {
  it('uses the aiagencydanmark.dk measurement ID', () => expect(GA4_MEASUREMENT_ID).toBe('G-6L5R8WZTQ6'));

  it('nothing exists before it is called (no consent, no script, no dataLayer)', () => {
    expect(document.getElementById('ga4-script')).toBeNull();
    expect(w.dataLayer).toBeUndefined();
  });

  it('injects gtag.js once, configures the property and grants analytics only', () => {
    loadGA4({ marketing: false });
    loadGA4({ marketing: false });
    expect(document.querySelectorAll('#ga4-script')).toHaveLength(1);
    expect((document.getElementById('ga4-script') as HTMLScriptElement).src).toBe('https://www.googletagmanager.com/gtag/js?id=G-6L5R8WZTQ6');
    expect(calls().filter((c) => c[0] === 'config')).toEqual([['config', 'G-6L5R8WZTQ6']]);
    expect(calls()[0]).toEqual(['consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }]);
  });

  it('grants ad signals only with marketing consent', () => {
    loadGA4({ marketing: true });
    expect(calls()[0][2]).toMatchObject({ ad_storage: 'granted', ad_personalization: 'granted' });
  });

  it('is switched off on private pages and back on for public pages', () => {
    loadGA4({ marketing: false });
    expect(w[flag]).toBe(false);
    applyGA4RoutePolicy('/da/app/crm/leads/0b6f1c1e-0000-4000-8000-000000000000');
    expect(w[flag]).toBe(true);
    applyGA4RoutePolicy('/da/pricing');
    expect(w[flag]).toBe(false);
  });

  it('starts disabled when loaded on a private page', () => {
    window.history.replaceState(null, '', '/en/app/dashboard');
    loadGA4({ marketing: false });
    expect(w[flag]).toBe(true);
  });

  it('withdrawal disables GA4, denies consent, deletes _ga cookies and asks for a reload', () => {
    loadGA4({ marketing: true });
    document.cookie = '_ga=GA1.1.123; path=/';
    document.cookie = '_ga_6L5R8WZTQ6=GS1.1; path=/';
    document.cookie = 'keep=1; path=/';
    expect(withdrawAnalytics()).toBe(true);
    expect(w[flag]).toBe(true);
    expect(calls().at(-1)).toEqual(['consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }]);
    expect(document.cookie).not.toMatch(/_ga/);
    expect(document.cookie).toMatch(/keep=1/);
  });

  it('withdrawal before anything ran needs no reload', () => expect(withdrawAnalytics()).toBe(false));
});

describe('Leadfeeder', () => {
  it('never starts on private pages', () => {
    window.history.replaceState(null, '', '/da/app/dashboard');
    loadLeadfeeder();
    expect(document.getElementById('ldfdr-script')).toBeNull();
  });
  it('starts once on public pages', () => {
    loadLeadfeeder(); loadLeadfeeder();
    expect(document.querySelectorAll('#ldfdr-script')).toHaveLength(1);
  });
});

describe('private paths and Vercel URL redaction', () => {
  it('classifies paths', () => {
    expect(isPrivatePath('/da/app/crm')).toBe(true);
    expect(isPrivatePath('/app')).toBe(true);
    expect(isPrivatePath('/en/auth/login')).toBe(true);
    expect(isPrivatePath('/da/pricing')).toBe(false);
    expect(isPrivatePath('/da/apps-overview')).toBe(false);
  });
  it('replaces record ids and drops non-utm query params', () => {
    expect(redactAnalyticsUrl('https://www.aiagencydanmark.dk/da/app/crm/leads/0b6f1c1e-1234-4abc-8def-1234567890ab?tab=notes&utm_source=x#a'))
      .toBe('https://www.aiagencydanmark.dk/da/app/crm/leads/:id?utm_source=x');
    expect(redactAnalyticsUrl('https://www.aiagencydanmark.dk/da/app/invoices/12345')).toBe('https://www.aiagencydanmark.dk/da/app/invoices/:id');
    expect(redactAnalyticsUrl('https://www.aiagencydanmark.dk/da/pricing')).toBe('https://www.aiagencydanmark.dk/da/pricing');
  });
});
