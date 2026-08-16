import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Tracks user session duration. Creates a session row on mount,
 * periodically updates duration, and marks ended_at on unmount.
 * Uses auth.uid() (user_id from profiles) to match RLS policies.
 */
export function useSessionTracker() {
  const { user } = useAuth();
  const sessionIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // user_id is the auth uid, company_id from profile
    const authUid = user?.user_id;
    const companyId = user?.company_id;
    if (!authUid || !companyId) return;

    let cancelled = false;

    const startSession = async () => {
      try {
        const { data } = await supabase
          .from('user_sessions')
          .insert({ user_id: authUid, company_id: companyId })
          .select('id')
          .single();
        if (data && !cancelled) sessionIdRef.current = data.id;
      } catch {
        // Silently fail — non-critical feature
      }
    };

    startSession();

    intervalRef.current = setInterval(async () => {
      if (!sessionIdRef.current) return;
      try {
        const { data: session } = await supabase
          .from('user_sessions')
          .select('started_at')
          .eq('id', sessionIdRef.current)
          .single();
        if (session) {
          const seconds = Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000);
          await supabase
            .from('user_sessions')
            .update({ duration_seconds: seconds })
            .eq('id', sessionIdRef.current);
        }
      } catch {}
    }, 60_000);

    const endSession = () => {
      if (sessionIdRef.current) {
        supabase
          .from('user_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', sessionIdRef.current)
          .then(() => {});
      }
    };

    window.addEventListener('beforeunload', endSession);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', endSession);
      if (intervalRef.current) clearInterval(intervalRef.current);
      endSession();
    };
  }, [user?.user_id, user?.company_id]);
}
