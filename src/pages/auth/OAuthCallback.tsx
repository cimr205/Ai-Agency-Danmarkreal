import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { isLocale } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

/**
 * OAuth callback - waits for auth state to resolve, then redirects.
 * Handles both hash-based token flow and session-based flow.
 */
export default function OAuthCallbackPage() {
  const params = useParams();
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const attemptedRef = useRef(false);

  useEffect(() => {
    // If already authenticated via auth context, redirect immediately
    if (!isLoading && isAuthenticated) {
      navigate(`/${locale}/app/dashboard`, { replace: true });
      return;
    }

    // If auth context says not loading and not authenticated,
    // try to get session directly (race condition fix)
    if (!isLoading && !isAuthenticated && !attemptedRef.current) {
      attemptedRef.current = true;

      // Give Supabase a moment to process the OAuth tokens from URL hash
      const checkSession = async () => {
        // Wait a bit for the auth state change to propagate
        await new Promise(r => setTimeout(r, 1000));

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Session exists but auth context hasn't caught up yet - wait for it
          const maxWait = 10000;
          const start = Date.now();
          const poll = setInterval(() => {
            if (Date.now() - start > maxWait) {
              clearInterval(poll);
              // Force navigate - session exists
              navigate(`/${locale}/app/dashboard`, { replace: true });
            }
          }, 500);
          return () => clearInterval(poll);
        } else {
          // No session at all after OAuth - redirect to login after delay
          setTimeout(() => {
            navigate(`/${locale}/auth/login`, { replace: true });
          }, 8000);
        }
      };

      checkSession();
    }
  }, [isLoading, isAuthenticated, locale, navigate]);

  // Also listen for auth state changes directly
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Small delay to let AuthContext catch up
        setTimeout(() => {
          navigate(`/${locale}/app/dashboard`, { replace: true });
        }, 500);
      }
    });
    return () => subscription.unsubscribe();
  }, [locale, navigate]);

  return (
    <div className="min-h-screen grid place-items-center bg-background px-4">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Logger dig ind...</p>
      </div>
    </div>
  );
}