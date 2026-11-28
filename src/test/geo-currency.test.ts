import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const geo = (body: unknown) => vi.fn().mockResolvedValue({ ok: true, json: async () => body });

describe('local price by IP country', () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/da');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('Denmark gets the exact DKK price, USA the exact USD price', async () => {
    const { priceFor } = await import('@/lib/currency');
    expect(priceFor('DKK', 1)).toEqual({ currency: 'DKK', amount: 499, approximate: false, checkout: 'dkk' });
    expect(priceFor('USD', 0.1468)).toEqual({ currency: 'USD', amount: 69, approximate: false, checkout: 'usd' });
  });

  it('every other currency is converted from 499 DKK, approximate, DKK checkout', async () => {
    const { priceFor } = await import('@/lib/currency');
    expect(priceFor('EUR', 0.1338)).toEqual({ currency: 'EUR', amount: 67, approximate: true, checkout: 'dkk' });
    expect(priceFor('SEK', 1.4996)).toMatchObject({ currency: 'SEK', amount: 748, approximate: true });
    expect(priceFor('JPY', 22.37)).toMatchObject({ currency: 'JPY', amount: 11160 });
  });

  it('falls back to DKK without currency or rate', async () => {
    const { priceFor, DKK_PRICE } = await import('@/lib/currency');
    expect(priceFor(null, null)).toBe(DKK_PRICE);
    expect(priceFor('EUR', null)).toBe(DKK_PRICE);
    expect(priceFor('EUR', 0)).toBe(DKK_PRICE);
  });

  it('resolves from /api/geo once per session', async () => {
    const f = geo({ country: 'DE', currency: 'EUR', rate: 0.134 });
    vi.stubGlobal('fetch', f);
    const { resolvePrice, cachedPrice, resolveCheckoutCurrency } = await import('@/lib/currency');
    expect(cachedPrice().currency).toBe('DKK');
    expect((await resolvePrice()).currency).toBe('EUR');
    expect(await resolveCheckoutCurrency()).toBe('dkk');
    expect(f).toHaveBeenCalledTimes(1);
    expect(cachedPrice().currency).toBe('EUR');
  });

  it('falls back to DKK when the lookup is not JSON (local dev SPA fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('html'); } }));
    const { resolvePrice } = await import('@/lib/currency');
    expect((await resolvePrice()).currency).toBe('DKK');
  });

  it('?country= is forwarded for QA and not cached', async () => {
    window.history.replaceState(null, '', '/en?country=us');
    const f = geo({ country: 'US', currency: 'USD', rate: 0.1468 });
    vi.stubGlobal('fetch', f);
    const { resolvePrice } = await import('@/lib/currency');
    expect((await resolvePrice()).checkout).toBe('usd');
    expect(f.mock.calls[0][0]).toBe('/api/geo?country=US');
    expect(sessionStorage.length).toBe(0);
  });

  it('formats money', async () => {
    const { formatMoney, formatLocalPrice, priceFor } = await import('@/lib/currency');
    expect(formatMoney('DKK', 499)).toBe('499 kr.');
    window.history.replaceState(null, '', '/en');
    expect(formatMoney('USD', 0)).toBe('$0');
    expect(formatLocalPrice(priceFor('EUR', 0.1338))).toBe('≈ €67');
  });
});
