import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';

const inserted: Array<Record<string, unknown>[]> = [];
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
    from: () => ({ insert: (rows: Record<string, unknown>[]) => { inserted.push(rows); return Promise.resolve({ error: null }); } }),
  },
}));

import { CookieConsent } from './CookieConsent';
import { CONSENT_VERSION, COOKIE_KEY, OPEN_COOKIE_SETTINGS } from '@/lib/consent';

const reload = vi.fn();
const ga = () => document.getElementById('ga4-script');
const lf = () => document.getElementById('ldfdr-script');

function renderBanner(locale: 'en' | 'da' = 'en') {
  return render(<I18nProvider locale={locale}><CookieConsent /></I18nProvider>);
}

beforeEach(() => {
  localStorage.clear();
  inserted.length = 0;
  document.head.querySelectorAll('script').forEach((s) => s.remove());
  const w = window as unknown as Record<string, unknown>;
  delete w.dataLayer; delete w.gtag; delete w.ldfdr;
  window.history.replaceState(null, '', '/en');
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, pathname: '/en', hostname: 'localhost', reload } });
  reload.mockReset();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('cookie consent flows', () => {
  it('first visit: banner shows and nothing tracks before a choice', () => {
    renderBanner();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(ga()).toBeNull();
    expect(lf()).toBeNull();
  });

  it('reject is one click, equal in weight to accept, and loads nothing', async () => {
    renderBanner();
    const reject = screen.getByRole('button', { name: 'Reject all' });
    const accept = screen.getByRole('button', { name: 'Accept all' });
    expect(reject.className).toBe(accept.className);
    fireEvent.click(reject);
    expect(ga()).toBeNull();
    expect(lf()).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(COOKIE_KEY)!)).toMatchObject({ analytics: false, marketing: false, version: CONSENT_VERSION });
    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].map((r) => [r.consent_type, r.consent_value])).toEqual([['cookie_necessary', true], ['cookie_analytics', false], ['cookie_marketing', false]]);
    expect(inserted[0][0].metadata).toMatchObject({ action: 'reject_all', version: CONSENT_VERSION });
    expect(typeof inserted[0][0].anonymous_id).toBe('string');
  });

  it('accept all loads GA4 and Leadfeeder and logs the choice', async () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Accept all' }));
    expect(ga()).not.toBeNull();
    expect(lf()).not.toBeNull();
    await waitFor(() => expect(inserted[0][0].metadata).toMatchObject({ action: 'accept_all' }));
  });

  it('partial consent: analytics without marketing keeps ad signals denied', () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Analytics' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save choices' }));
    expect(ga()).not.toBeNull();
    const dl = (window as unknown as { dataLayer: IArguments[] }).dataLayer.map((a) => Array.from(a));
    expect(dl[0][2]).toMatchObject({ analytics_storage: 'granted', ad_storage: 'denied' });
  });

  it('returning visitor: no banner, earlier opt-in honoured, opt-out honoured', () => {
    localStorage.setItem(COOKIE_KEY, JSON.stringify({ necessary: true, analytics: true, marketing: false, timestamp: 'x', version: CONSENT_VERSION }));
    const { unmount } = renderBanner();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ga()).not.toBeNull();
    unmount();
    document.head.querySelectorAll('script').forEach((s) => s.remove());
    localStorage.setItem(COOKIE_KEY, JSON.stringify({ necessary: true, analytics: false, marketing: false, timestamp: 'x', version: CONSENT_VERSION }));
    renderBanner();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ga()).toBeNull();
  });

  it('consent from an older policy version is asked again', () => {
    localStorage.setItem(COOKIE_KEY, JSON.stringify({ necessary: true, analytics: true, marketing: true, timestamp: 'x' }));
    renderBanner();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(ga()).toBeNull();
  });

  it('withdrawal: settings reopen with stored choices; rejecting stops tracking and reloads', async () => {
    localStorage.setItem(COOKIE_KEY, JSON.stringify({ necessary: true, analytics: true, marketing: true, timestamp: 'x', version: CONSENT_VERSION }));
    renderBanner();
    expect(ga()).not.toBeNull();
    act(() => { window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS)); });
    expect(screen.getByRole('switch', { name: 'Analytics' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Reject all' }));
    expect(reload).toHaveBeenCalledTimes(1);
    expect((window as unknown as Record<string, unknown>)['ga-disable-G-6L5R8WZTQ6']).toBe(true);
    await waitFor(() => expect(inserted[0][0].metadata).toMatchObject({ withdrawal: true }));
  });

  it('Danish banner offers the same choices', () => {
    renderBanner('da');
    expect(screen.getByRole('button', { name: 'Afvis alle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accepter alle' })).toBeInTheDocument();
  });
});
