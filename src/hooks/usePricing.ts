import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Pricing {
  /** Seat price per interval, as charged by Stripe (e.g. 499). */
  amount: number;
  /** ISO currency code, e.g. "DKK" or "USD". */
  currency: string;
  /** Billing interval, e.g. "month". */
  interval: string;
  /** True until the live Stripe value has loaded; `amount` holds the fallback meanwhile. */
  loading: boolean;
  /** Formatted for display, e.g. "499 kr." / "$499". */
  formatted: string;
}

// Fallback shown only while the live value loads or if get-pricing is unreachable.
// The real amount always comes from Stripe via the get-pricing edge function.
const FALLBACK_AMOUNT = 499;

function format(amount: number, currency: string): string {
  if (currency === 'DKK') return `${amount.toLocaleString('da-DK')} kr.`;
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/**
 * Reads the live seat price from Stripe (via the get-pricing edge function) so no
 * component hardcodes an amount. Currency follows the active locale (/en → USD).
 */
export function usePricing(): Pricing {
  const localeMatch = typeof window !== 'undefined' ? window.location.pathname.match(/^\/([a-z]{2})(\/|$)/) : null;
  const locale = localeMatch?.[1] ?? 'da';
  const wantCurrency = locale === 'en' ? 'USD' : 'DKK';

  const [pricing, setPricing] = useState<Pricing>({
    amount: FALLBACK_AMOUNT,
    currency: wantCurrency,
    interval: 'month',
    loading: true,
    formatted: format(FALLBACK_AMOUNT, wantCurrency),
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-pricing', {
          body: { currency: wantCurrency.toLowerCase() },
        });
        if (error || !data || typeof data.amount !== 'number') throw error ?? new Error('No pricing');
        if (cancelled) return;
        setPricing({
          amount: data.amount,
          currency: data.currency ?? wantCurrency,
          interval: data.interval ?? 'month',
          loading: false,
          formatted: format(data.amount, data.currency ?? wantCurrency),
        });
      } catch {
        // Keep the fallback amount; just stop the loading state.
        if (!cancelled) setPricing(prev => ({ ...prev, loading: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [wantCurrency]);

  return pricing;
}
