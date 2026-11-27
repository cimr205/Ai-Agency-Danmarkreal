import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('geo currency', () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/da');
  });

  it('maps only US to USD, everything else to DKK', async () => {
    const { currencyForCountry } = await import('@/lib/currency');
    expect(currencyForCountry('US')).toBe('usd');
    expect(currencyForCountry('us')).toBe('usd');
    expect(currencyForCountry('DK')).toBe('dkk');
    expect(currencyForCountry('DE')).toBe('dkk');
    expect(currencyForCountry(null)).toBe('dkk');
  });

  it('resolves from /api/geo and caches for the session', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ country: 'US' }) });
    vi.stubGlobal('fetch', fetchMock);
    const { resolveCurrency, cachedCurrency } = await import('@/lib/currency');
    expect(cachedCurrency()).toBe('dkk');
    expect(await resolveCurrency()).toBe('usd');
    expect(await resolveCurrency()).toBe('usd');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cachedCurrency()).toBe('usd');
    vi.unstubAllGlobals();
  });

  it('falls back to DKK when the lookup fails or is not JSON (local dev)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('html'); } }));
    const { resolveCurrency } = await import('@/lib/currency');
    expect(await resolveCurrency()).toBe('dkk');
    vi.unstubAllGlobals();
  });

  it('honours ?currency= override', async () => {
    window.history.replaceState(null, '', '/da?currency=usd');
    const { resolveCurrency } = await import('@/lib/currency');
    expect(await resolveCurrency()).toBe('usd');
  });

  it('formats both currencies', async () => {
    const { formatPrice } = await import('@/lib/currency');
    expect(formatPrice('dkk', 499)).toBe('499 kr.');
    expect(formatPrice('usd', 0)).toBe('$0');
  });
});
