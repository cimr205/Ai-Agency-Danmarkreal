import { afterEach, describe, expect, it } from 'vitest';
import { GA_MEASUREMENT_ID, loadGoogleAnalytics } from './analytics';

type W = typeof window & { dataLayer?: IArguments[]; gtag?: unknown };

afterEach(() => {
  document.getElementById('ga4-script')?.remove();
  delete (window as W).dataLayer;
  delete (window as W).gtag;
});

const calls = () => ((window as W).dataLayer ?? []).map((a) => Array.from(a));

describe('loadGoogleAnalytics', () => {
  it('uses the aiagencydanmark.dk measurement ID', () => {
    expect(GA_MEASUREMENT_ID).toBe('G-6L5R8WZTQ6');
  });

  it('injects gtag.js once and configures the property', () => {
    loadGoogleAnalytics({ marketing: false });
    loadGoogleAnalytics({ marketing: false });
    const scripts = document.querySelectorAll('#ga4-script');
    expect(scripts).toHaveLength(1);
    expect((scripts[0] as HTMLScriptElement).src).toBe('https://www.googletagmanager.com/gtag/js?id=G-6L5R8WZTQ6');
    expect(calls().filter((c) => c[0] === 'config')).toEqual([['config', 'G-6L5R8WZTQ6']]);
  });

  it('denies ad storage without marketing consent and grants it with it', () => {
    loadGoogleAnalytics({ marketing: false });
    expect(calls()[0]).toEqual(['consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' }]);
    loadGoogleAnalytics({ marketing: true });
    expect(calls().at(-1)).toEqual(['consent', 'update', { analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' }]);
  });

  it('loads nothing before it is called (no consent, no script)', () => {
    expect(document.getElementById('ga4-script')).toBeNull();
    expect((window as W).dataLayer).toBeUndefined();
  });
});
