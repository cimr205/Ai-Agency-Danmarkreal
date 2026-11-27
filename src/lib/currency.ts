import { useEffect, useState } from 'react';

/**
 * Display + checkout currency, chosen from the visitor's IP country:
 * US → USD, everything else (Denmark first) → DKK.
 *
 * Country comes from /api/geo (Vercel's x-vercel-ip-country header). DKK is
 * the default while it loads and whenever the lookup fails (local dev, ad
 * blockers), so nobody is ever shown a price they can't be charged.
 * `?currency=usd|dkk` overrides it for QA.
 */
export type Currency = 'dkk' | 'usd';

export const SEAT_PRICE: Record<Currency, { amount: number; symbol: string; symbolBefore: boolean }> = {
  dkk: { amount: 499, symbol: 'kr', symbolBefore: false },
  usd: { amount: 69, symbol: '$', symbolBefore: true },
};

const STORAGE_KEY = 'aiad_currency';
let pending: Promise<Currency> | null = null;

export function currencyForCountry(country: string | null | undefined): Currency {
  return country?.toUpperCase() === 'US' ? 'usd' : 'dkk';
}

function isCurrency(v: unknown): v is Currency {
  return v === 'usd' || v === 'dkk';
}

function readOverride(): Currency | null {
  try {
    const q = new URLSearchParams(window.location.search).get('currency');
    return isCurrency(q) ? q : null;
  } catch {
    return null;
  }
}

function readStored(): Currency | null {
  try {
    const v = sessionStorage.getItem(STORAGE_KEY);
    return isCurrency(v) ? v : null;
  } catch {
    return null;
  }
}

function store(c: Currency) {
  try {
    sessionStorage.setItem(STORAGE_KEY, c);
  } catch {
    // storage unavailable — the in-memory promise still dedupes lookups
  }
}

/** Best answer available right now, without waiting. */
export function cachedCurrency(): Currency {
  return readOverride() ?? readStored() ?? 'dkk';
}

/** Resolves the visitor's currency once per session. Never rejects. */
export function resolveCurrency(): Promise<Currency> {
  const override = readOverride();
  if (override) {
    store(override);
    return Promise.resolve(override);
  }
  const stored = readStored();
  if (stored) return Promise.resolve(stored);
  pending ??= fetch('/api/geo', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { country?: string | null } | null) => currencyForCountry(d?.country))
    .catch((): Currency => 'dkk')
    .then((c) => {
      store(c);
      return c;
    });
  return pending;
}

export function useCurrency(): Currency {
  const [currency, setCurrency] = useState<Currency>(cachedCurrency);
  useEffect(() => {
    let alive = true;
    resolveCurrency().then((c) => alive && setCurrency(c));
    return () => {
      alive = false;
    };
  }, []);
  return currency;
}

/** "499 kr." / "$79" — amount with the currency's symbol on the right side. */
export function formatPrice(currency: Currency, amount: number): string {
  const p = SEAT_PRICE[currency];
  return p.symbolBefore ? `${p.symbol}${amount}` : `${amount} ${p.symbol}.`;
}
