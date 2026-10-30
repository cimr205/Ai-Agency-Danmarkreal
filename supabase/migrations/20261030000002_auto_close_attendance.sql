-- QA #82/#83: an attendance_log can be left open (check_in set, check_out NULL)
-- indefinitely. One real row ran for ~161 hours, poisoning every hour total and
-- payroll. The client now caps an open session's displayed hours, but the
-- authoritative fix is server-side: close any session that has been open longer
-- than a maximum shift length, and backfill the rows that are already stuck.

-- Max plausible shift length. Keep in sync with MAX_SHIFT_HOURS in useWorkforce.ts.
CREATE OR REPLACE FUNCTION public.auto_close_stale_attendance(_max_hours integer DEFAULT 16)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed_count integer;
BEGIN
  WITH updated AS (
    UPDATE public.attendance_logs
       SET check_out = check_in + make_interval(hours => _max_hours),
           notes = coalesce(notes || ' | ', '')
                   || 'Auto-closed: no check-out recorded within ' || _max_hours || 'h'
     WHERE check_out IS NULL
       AND check_in < now() - make_interval(hours => _max_hours)
    RETURNING 1
  )
  SELECT count(*) INTO closed_count FROM updated;
  RETURN closed_count;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_close_stale_attendance(integer) FROM PUBLIC, anon, authenticated;

-- Backfill the sessions that are already stuck (incl. the 161 h row).
SELECT public.auto_close_stale_attendance(16);

-- Run it hourly if pg_cron is installed. Wrapped so the migration still applies
-- on projects without pg_cron.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'auto-close-stale-attendance',
      '7 * * * *',
      $cron$ SELECT public.auto_close_stale_attendance(16); $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped: %', SQLERRM;
END;
$$;
