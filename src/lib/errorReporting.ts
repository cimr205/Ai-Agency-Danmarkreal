import { supabase } from '@/integrations/supabase/client';

/**
 * Fire-and-forget crash report. Must never throw — this runs from contexts
 * (React's componentDidCatch, window error handlers) where the app is
 * already failing, and a reporting failure must not compound that.
 */
export function reportClientError(error: unknown, extra?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  void supabase.from('client_error_reports').insert({
    message: message.slice(0, 2000),
    stack: stack ? `${stack}${extra ? '\n\nextra: ' + JSON.stringify(extra) : ''}`.slice(0, 8000) : null,
    url: typeof window !== 'undefined' ? window.location.href : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  }).then(({ error: reportError }) => {
    if (reportError) console.error('[errorReporting] Failed to report error:', reportError);
  });
}
