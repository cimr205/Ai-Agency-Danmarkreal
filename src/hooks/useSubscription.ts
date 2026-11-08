import { useState, useEffect, useCallback } from 'react';
import { invokeFunction } from '@/lib/functions';

export interface SeatMismatch {
  activeUsers: number;
  purchasedSeats: number;
}

export interface SubscriptionState {
  subscribed: boolean;
  status: string;
  trialEndsAt: string | null;
  periodEnd: string | null;
  seatLimit: number;
  seatMismatch: SeatMismatch | null;
  isLoading: boolean;
}

export function useSubscription() {
  const [state, setState] = useState<SubscriptionState>({
    subscribed: false,
    status: 'none',
    trialEndsAt: null,
    periodEnd: null,
    seatLimit: 0,
    seatMismatch: null,
    isLoading: true,
  });

  const checkSubscription = useCallback(async (body?: Record<string, unknown>) => {
    try {
      const data = await invokeFunction<{
        subscribed?: boolean;
        status?: string;
        trial_ends_at?: string | null;
        period_end?: string | null;
        seat_limit?: number;
        seat_mismatch?: SeatMismatch | null;
      }>('check-subscription', body ? { body } : undefined);
      setState({
        subscribed: data?.subscribed ?? false,
        status: data?.status ?? 'none',
        trialEndsAt: data?.trial_ends_at ?? null,
        periodEnd: data?.period_end ?? null,
        seatLimit: data?.seat_limit ?? 0,
        seatMismatch: data?.seat_mismatch ?? null,
        isLoading: false,
      });
    } catch {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Owner/admin-only — applies a pending seat-count mismatch to the live
  // Stripe subscription. Never happens automatically; the server also
  // re-checks the admin role before touching billing.
  const confirmSeatSync = useCallback(() => checkSubscription({ confirm_seat_sync: true }), [checkSubscription]);

  useEffect(() => {
    checkSubscription();
    const interval = setInterval(checkSubscription, 60_000);
    return () => clearInterval(interval);
  }, [checkSubscription]);

  const startCheckout = async (seatLimit?: number) => {
    // Detect locale from URL (/en/... → USD, everything else → DKK)
    const localeMatch = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/);
    const locale = localeMatch?.[1] ?? 'da';
    const currency = locale === 'en' ? 'usd' : 'dkk';
    const data = await invokeFunction<{ url?: string }>('create-checkout', {
      body: { seat_limit: seatLimit, currency, locale },
    });
    // Same-tab navigation, not a new tab: create-checkout's success/cancel
    // URLs point back into this app, and the user needs to actually land on
    // that confirmation — opening in a new tab left the original tab (and
    // its subscription state) stale with no indication anything happened.
    if (data?.url) window.location.href = data.url;
    return data;
  };

  const openPortal = async () => {
    const localeMatch = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/);
    const locale = localeMatch?.[1] ?? 'da';
    const data = await invokeFunction<{ url?: string }>('customer-portal', { body: { locale } });
    if (data?.url) window.location.href = data.url;
    return data;
  };

  return { ...state, checkSubscription, confirmSeatSync, startCheckout, openPortal };
}
