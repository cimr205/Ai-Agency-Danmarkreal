import { useState, useEffect, useCallback } from 'react';
import { invokeFunction } from '@/lib/functions';

export interface SubscriptionState {
  subscribed: boolean;
  status: string;
  trialEndsAt: string | null;
  periodEnd: string | null;
  seatLimit: number;
  isLoading: boolean;
}

export function useSubscription() {
  const [state, setState] = useState<SubscriptionState>({
    subscribed: false,
    status: 'none',
    trialEndsAt: null,
    periodEnd: null,
    seatLimit: 0,
    isLoading: true,
  });

  const checkSubscription = useCallback(async () => {
    try {
      const data = await invokeFunction<{
        subscribed?: boolean;
        status?: string;
        trial_ends_at?: string | null;
        period_end?: string | null;
        seat_limit?: number;
      }>('check-subscription');
      setState({
        subscribed: data?.subscribed ?? false,
        status: data?.status ?? 'none',
        trialEndsAt: data?.trial_ends_at ?? null,
        periodEnd: data?.period_end ?? null,
        seatLimit: data?.seat_limit ?? 0,
        isLoading: false,
      });
    } catch {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

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
    if (data?.url) window.open(data.url, '_blank');
    return data;
  };

  const openPortal = async () => {
    const data = await invokeFunction<{ url?: string }>('customer-portal');
    if (data?.url) window.open(data.url, '_blank');
    return data;
  };

  return { ...state, checkSubscription, startCheckout, openPortal };
}
