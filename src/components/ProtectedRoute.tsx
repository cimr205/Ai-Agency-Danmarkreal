/**
 * Protected Route with auth + onboarding + subscription gate
 * - No session → /login
 * - Session but no company → /onboarding
 * - Company disabled → blocked screen
 * - Company has no active subscription → /subscription paywall
 */

import { ReactNode, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isLocale } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
}

interface CompanyGateState {
  disabled: boolean;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
}

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const [gate, setGate] = useState<CompanyGateState | null>(null);
  const gateCompanyIdRef = useRef<string | null | undefined>(undefined);

  // Reset the gate the instant the company_id we last fetched for no longer
  // matches the current user. Without this, a stale gate computed for the
  // *previous* company_id (e.g. `null` while auth was still loading) can be
  // read on the very next render — before the effect below has a chance to
  // re-fetch — and incorrectly bounce a paying company to the paywall.
  if (gateCompanyIdRef.current !== (user?.company_id ?? null) && gate !== null) {
    setGate(null);
  }

  useEffect(() => {
    gateCompanyIdRef.current = user?.company_id ?? null;

    if (!user?.company_id) {
      setGate({ disabled: false, subscriptionStatus: null, trialEndsAt: null });
      return;
    }

    let cancelled = false;

    const fetchGate = async (attempt: number): Promise<void> => {
      const { data, error } = await supabase
        .from('companies')
        .select('disabled, subscription_status, trial_ends_at')
        .eq('id', user.company_id)
        .single();

      if (cancelled) return;

      // A transient error (e.g. the Supabase client's session hasn't finished
      // attaching yet right after a hard page reload) must never be read as
      // "no subscription" — that would incorrectly strand a paying company on
      // the paywall. Retry a few times before giving up.
      if (error || !data) {
        if (attempt < 3) {
          setTimeout(() => fetchGate(attempt + 1), 400 * (attempt + 1));
          return;
        }
        // Out of retries — keep whatever gate we already had (if any) rather
        // than overwriting a known-good state with a failure.
        setGate(prev => prev ?? { disabled: false, subscriptionStatus: null, trialEndsAt: null });
        return;
      }

      setGate({
        disabled: data.disabled ?? false,
        subscriptionStatus: data.subscription_status ?? null,
        trialEndsAt: data.trial_ends_at ?? null,
      });
    };

    fetchGate(0);
    return () => { cancelled = true; };
  }, [user?.company_id, location.pathname]);

  if (isLoading || gate === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={`/${locale}/auth/login`} state={{ from: location }} replace />;
  }

  if (gate.disabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto rounded-full bg-destructive/10 p-4 w-fit mb-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle>Adgang deaktiveret</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Din virksomheds adgang til systemet er blevet deaktiveret af administratoren.
              Kontakt support for mere information.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Onboarding gate
  if (user && !user.company_id) {
    if (!location.pathname.includes('/onboarding')) {
      return <Navigate to={`/${locale}/app/onboarding`} replace />;
    }
    return <>{children}</>;
  }

  // Subscription gate — applies to everything except the subscription, onboarding, and admin pages
  const path = location.pathname;
  const isExempt =
    path.includes('/subscription') ||
    path.includes('/onboarding') ||
    path.includes('/admin');

  // Permanent bypass: trial_ends_at far in the future (manual partner/test accounts, per spec)
  const trialFarFuture = gate.trialEndsAt
    ? new Date(gate.trialEndsAt).getTime() > Date.now() + 5 * 365 * 24 * 60 * 60 * 1000
    : false;

  const hasActiveSubscription =
    trialFarFuture || ACTIVE_STATUSES.has(gate.subscriptionStatus ?? '');

  if (!hasActiveSubscription && !isExempt) {
    return <Navigate to={`/${locale}/app/subscription`} replace />;
  }

  return <>{children}</>;
}
