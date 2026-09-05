import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// One row per browser-tab auth session, not per page load/refresh — the id
// lives in sessionStorage (cleared when the tab closes, unlike localStorage)
// so a refresh resumes the same row instead of inserting a new one.
const SESSION_ROW_ID_KEY = 'app_session_row_id';

/**
 * Tracks user session duration. Creates a session row on first mount,
 * resumes it across page refreshes within the same tab, periodically updates
 * duration, and marks ended_at on unmount.
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
        const existingId = sessionStorage.getItem(SESSION_ROW_ID_KEY);
        if (existingId) {
          const { data: existing } = await supabase
            .from('user_sessions')
            .select('id, user_id')
            .eq('id', existingId)
            .maybeSingle();
          if (existing && existing.user_id === authUid) {
            if (!cancelled) sessionIdRef.current = existing.id;
            // Refresh may have raced a beforeunload that marked ended_at — clear it since the tab is still open.
            await supabase.from('user_sessions').update({ ended_at: null }).eq('id', existing.id);
            return;
          }
          sessionStorage.removeItem(SESSION_ROW_ID_KEY);
        }

        const { data } = await supabase
          .from('user_sessions')
          .insert({ user_id: authUid, company_id: companyId })
          .select('id')
          .single();
        if (data && !cancelled) {
          sessionIdRef.current = data.id;
          sessionStorage.setItem(SESSION_ROW_ID_KEY, data.id);
        }
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
      } catch { /* best effort — session may already be closed */ }
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
