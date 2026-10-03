-- Post-step for the operating-kernel branch (20260912000001 through
-- 20260913000001, merged this same deploy). Those four migrations create
-- new event triggers (trg_event_customers, trg_event_emails, etc.) but
-- never drop the three pre-existing ones they supersede — confirmed live
-- via information_schema.triggers, and independently confirmed by two
-- separate reviews of the migration set and the changed edge functions.
--
-- Left in place, every new lead insert and every synced email would fire
-- BOTH the old trigger and the new one, each independently calling
-- emit_workspace_event with a different idempotency_key (so the unique
-- constraint doesn't catch it) — every matching workflow runs twice,
-- creating duplicate tasks/notifications for every user from the moment
-- this deploys. Must run in the same deploy window as the four kernel
-- migrations and their edge function changes (gmail-sync now calls
-- route_incoming_email directly; without this, that call and the old
-- trigger both fire for the same inbound email).

DROP TRIGGER IF EXISTS tr_customer_lead_event_ins ON public.customers;
DROP TRIGGER IF EXISTS tr_customer_lead_event_upd ON public.customers;
DROP TRIGGER IF EXISTS tr_resolve_inbound_email ON public.emails;
