import { useEffect, useState } from 'react';

/**
 * Every visitor sees the price in their own country's currency.
 *
 * - Denmark: 499 kr. (the DKK Stripe price, exact)
 * - USA: $69 (the dedicated USD Stripe price, exact)
 * - Everywhere else: 499 kr. converted at today's rate and shown as "≈".
 *   Checkout uses the DKK price and Stripe Adaptive Pricing charges the
 *   customer in the same local currency (Stripe's own rate, 2–4% FX fee).
 *
 * The country/currency/rate come from /api/geo. DKK is the default while it
 * loads and whenever it fails (local dev, ad blockers). `?country=DE`
 * pretends to be in another country (QA; only changes what you see).
 */
export const DKK_SEAT_PRICE = 499;
export const USD_SEAT_PRICE = 69;

export type CheckoutCurrency = 'dkk' | 'usd';

export interface LocalPrice {
  /** ISO 4217, upper case */
  currency: string;
  /** monthly price per seat in `currency` */
  amount: number;
  /** true when converted at an exchange rate (not a fixed Stripe price) */
  approximate: boolean;
  /** which Stripe price checkout should use */
  checkout: CheckoutCurrency;
}

export const DKK_PRICE: LocalPrice = { currency: 'DKK', amount: DKK_SEAT_PRICE, approximate: false, checkout: 'dkk' };
const USD_PRICE: LocalPrice = { currency: 'USD', amount: USD_SEAT_PRICE, approximate: false, checkout: 'usd' };

interface GeoResponse {
  country?: string | null;
  currency?: string | null;
  rate?: number | null;
}

const STORAGE_KEY = 'aiad_local_price_v2';
let pending: Promise<LocalPrice> | null = null;

/** Round a converted price to something a person would write on a price tag. */
export function niceRound(value: number): number {
  if (value >= 1000) return Math.round(value / 10) * 10;
  if (value >= 100) return Math.round(value);
  if (value >= 10) return Math.round(value);
  return Math.round(value * 100) / 100;
}

export function priceFor(currency: string | null | undefined, rate: number | null | undefined): LocalPrice {
  const c = currency?.toUpperCase();
  if (!c || c === 'DKK') return DKK_PRICE;
  if (c === 'USD') return USD_PRICE;
  if (!rate || !Number.isFinite(rate) || rate <= 0) return DKK_PRICE;
  return { currency: c, amount: niceRound(DKK_SEAT_PRICE * rate), approximate: true, checkout: 'dkk' };
}

function isLocalPrice(v: unknown): v is LocalPrice {
  const p = v as LocalPrice;
  return !!p && typeof p.currency === 'string' && typeof p.amount === 'number' && (p.checkout === 'dkk' || p.checkout === 'usd');
}

/** `?country=DE` — pretend to be in another country (QA). */
function readCountryOverride(): string | null {
  try {
    const q = new URLSearchParams(window.location.search).get('country');
    return q && /^[a-z]{2}$/i.test(q) ? q.toUpperCase() : null;
  } catch {
    return null;
  }
}

function readStored(): LocalPrice | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    return isLocalPrice(v) ? v : null;
  } catch {
    return null;
  }
}

function store(p: LocalPrice) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // storage unavailable — the in-memory promise still dedupes lookups
  }
}

/** Best answer available right now, without waiting. */
export function cachedPrice(): LocalPrice {
  return (!readCountryOverride() && readStored()) || DKK_PRICE;
}

/** Resolves the visitor's local price once per session. Never rejects. */
export function resolvePrice(): Promise<LocalPrice> {
  const override = readCountryOverride();
  if (!override) {
    const stored = readStored();
    if (stored) return Promise.resolve(stored);
  }
  const url = override ? `/api/geo?country=${override}` : '/api/geo';
  pending ??= fetch(url, { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<GeoResponse>) : null))
    .then((geo) => priceFor(geo?.currency, geo?.rate))
    .catch(() => DKK_PRICE)
    .then((p) => {
      if (!override) store(p);
      return p;
    });
  return pending;
}

/** Which Stripe price checkout should use for this visitor. */
export async function resolveCheckoutCurrency(): Promise<CheckoutCurrency> {
  return (await resolvePrice()).checkout;
}

export function useLocalPrice(): LocalPrice {
  const [price, setPrice] = useState<LocalPrice>(cachedPrice);
  useEffect(() => {
    let alive = true;
    resolvePrice().then((p) => alive && setPrice(p));
    return () => {
      alive = false;
    };
  }, []);
  return price;
}

function numberLocale(): string | undefined {
  try {
    const m = window.location.pathname.match(/^\/(da|en|de)(\/|$)/);
    return m ? { da: 'da-DK', en: 'en-US', de: 'de-DE' }[m[1]] : undefined;
  } catch {
    return undefined;
  }
}

/** "499 kr.", "$69", "€67", "SEK 750" — formatted for the page language. */
export function formatMoney(currency: string, amount: number): string {
  if (currency === 'DKK') return `${amount} kr.`;
  const whole = Number.isInteger(amount);
  try {
    return new Intl.NumberFormat(numberLocale(), {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

/** Whole price incl. "≈" when converted. */
export function formatLocalPrice(p: LocalPrice): string {
  return `${p.approximate ? '≈ ' : ''}${formatMoney(p.currency, p.amount)}`;
}

/** "$", "€", "£", "kr" … for laying out a big price number by hand. */
export function currencySymbol(currency: string): string {
  if (currency === 'DKK') return 'kr';
  try {
    const part = new Intl.NumberFormat(numberLocale(), { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((x) => x.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}
