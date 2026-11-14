-- Found by actually running an UPDATE against public.payments on the
-- dedicated non-production test project (upqzzkdqlaqzgprufzrf) while
-- verifying 20261112160000's regression test for real, not by reading
-- code: `trg_auto_updated_at BEFORE UPDATE ON public.payments EXECUTE
-- FUNCTION auto_updated_at()` has existed since the baseline
-- (20260812000007) and unconditionally sets `NEW.updated_at = now()`, but
-- public.payments has never had an `updated_at` column (confirmed via
-- information_schema.columns on both the test project and production,
-- read-only) — unlike invoices, deals, quotes, and customers, which all
-- do. Every one of those tables uses the same generic auto_updated_at()
-- trigger.
--
-- Net effect, confirmed live: ANY UPDATE whatsoever to public.payments —
-- not specific to this session's reversal-authorization fix — currently
-- raises `record "new" has no field "updated_at"` and aborts the
-- transaction. This is a pre-existing bug, independent of
-- 20261112160000, that happened to surface while testing that migration
-- because the admin-reversal regression test needed to perform a real
-- UPDATE. It would equally break any other UPDATE to payments, including
-- ones already in use (e.g. whatever currently updates `metadata` or
-- `external_reference` after the fact, if anything does).
--
-- Fix: add the missing column, consistent with every other table that
-- carries the same trigger. No backfill logic needed beyond the default —
-- existing rows get `updated_at = created_at` so the column is never null
-- for historical rows, then the trigger keeps it current from here on.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.payments SET updated_at = created_at WHERE updated_at IS DISTINCT FROM created_at;
