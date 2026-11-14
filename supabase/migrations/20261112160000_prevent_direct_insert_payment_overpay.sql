-- Found during the customer-to-invoice E2E audit, by reading
-- prevent_payment_after_invoice_settled() (20261014000002) alongside
-- register_invoice_payment() (20260901000004): the safe RPC path rejects a
-- payment that exceeds the invoice's remaining balance
-- (`p_amount > v_remaining`), but "Users can create payments in their
-- company" (20260812000008) still grants authenticated users a direct
-- INSERT on public.payments. The BEFORE trigger added in 20261014000002
-- only rejects a new 'completed' payment once the invoice is ALREADY
-- 'paid' or 'cancelled' — it does not sum existing payments, so two direct
-- inserts that each stay under the full amount (e.g. two 700 kr payments
-- against a 1000 kr invoice) are both accepted by that trigger, and
-- auto_mark_invoice_paid() (20260812000006) only flips status to 'paid'
-- once the total clears the threshold — it never rejects the overage. Net
-- effect: the invoice ends up 'paid' but overpaid by 400 kr, with no
-- guard, for any caller using the direct REST/insert path instead of the
-- RPC. This was not live-reproduced against a database in this session
-- (no non-production Supabase credentials were available) — it is a
-- static read of the trigger/RLS/RPC logic, flagged here as the same
-- class of gap the two prior migrations already fixed for cross-tenant
-- and already-settled cases, not yet verified by a live concurrent test.
--
-- Fix (part 1 — overpay): extend the existing BEFORE INSERT/UPDATE trigger
-- function to also sum existing completed, non-reversed payments for the
-- invoice (excluding the row being written) and reject if adding this
-- payment would exceed the invoice amount — mirroring
-- register_invoice_payment()'s own guard, now enforced regardless of which
-- path writes to public.payments. The row lock already taken on
-- public.invoices (FOR UPDATE) in this same trigger is what makes the
-- sum-then-compare safe under concurrency: a second concurrent writer
-- blocks on that lock until the first commits, so it sees the first
-- payment's row in its own sum.
--
-- Fix (part 2 — zero amount): payments_amount_nonnegative (20260819000005)
-- only enforces amount >= 0 at the schema level, so a direct insert of a
-- 'completed' payment with amount = 0 passes the CHECK constraint and both
-- of the existing BEFORE triggers (nothing to compare against). The RPC
-- path already rejects this ("Payment amount must be positive"), so the
-- direct-insert path is made to match it here, for any status (not just
-- 'completed') since a non-positive payment is never meaningful.
--
-- Fix (part 3 — authorized reversal): public.payments has no dedicated
-- "reverse/refund" RPC — reversed_at/reversal_reason (20260901000004) can
-- currently only be set via the plain UPDATE RLS policy ("Users can update
-- payments in their company", 20260812000008), which has a USING clause
-- but no WITH CHECK, and is not restricted to company admins. Any
-- authenticated member of the company — not just an admin — can silently
-- mark their own completed payment as reversed, which reduces the ledger
-- total used by the overpay check above with no approval gate. This
-- mirrors the "Admins can delete quotes" / "Admins can create payroll"
-- pattern already used elsewhere in this schema for admin-only actions;
-- applied here as a trigger (not a new RLS policy) so it also covers any
-- future direct-insert/service-role path, consistent with parts 1 and 2.
--
-- Scoping note (caught while writing the regression test, not live): the
-- settled/overpay check below must only run when this write actually
-- changes the payment's financial facts (a new row, or status/amount
-- changing on an existing one) — not on every UPDATE of an already-
-- 'completed' row. Without that scoping, a legitimate admin reversal of a
-- payment that happens to belong to an already-'paid' invoice would itself
-- be rejected by the "Invoice is already fully paid" check, since
-- NEW.status is still 'completed' at that point. This also happened to be
-- a latent bug in the ORIGINAL 20261014000002 trigger (any unrelated
-- UPDATE — e.g. fixing payment_method, or the auto_updated_at trigger's
-- own touch — to a completed payment on an already-paid invoice would
-- have hit the same false rejection); fixed here as a side effect of
-- scoping correctly, not as a separate migration, since it's the same two
-- lines of logic.

CREATE OR REPLACE FUNCTION public.prevent_payment_after_invoice_settled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  invoice_status text;
  invoice_amount numeric;
  other_paid numeric;
  is_reversal_change boolean;
  is_financial_change boolean;
BEGIN
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive' USING ERRCODE = '22023';
  END IF;

  is_reversal_change := TG_OP = 'UPDATE'
    AND (NEW.reversed_at IS DISTINCT FROM OLD.reversed_at
         OR NEW.reversal_reason IS DISTINCT FROM OLD.reversal_reason);

  IF is_reversal_change
     AND auth.role() <> 'service_role'
     AND NOT public.is_company_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only a company admin can reverse a payment' USING ERRCODE = '42501';
  END IF;

  is_financial_change := TG_OP = 'INSERT'
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id;

  IF NEW.status = 'completed' AND is_financial_change THEN
    SELECT status, amount INTO invoice_status, invoice_amount
    FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;

    IF invoice_status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot record a payment against a cancelled invoice' USING ERRCODE = '23505';
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO other_paid
    FROM public.payments
    WHERE invoice_id = NEW.invoice_id
      AND status = 'completed'
      AND reversed_at IS NULL
      AND id <> NEW.id;

    -- "Already fully paid" and "exceeds remaining balance" are the same
    -- check expressed from the ledger, not from invoices.status — found
    -- necessary by actually running this against a database (not caught
    -- by reading the code): auto_create_payment_on_invoice_paid() (part 4
    -- below) sets invoices.status = 'paid' and THEN inserts the
    -- explanatory payment row in the same transaction. A status-based
    -- check ("if invoice_status = 'paid', reject") would see that
    -- already-'paid' status and wrongly reject the very payment that
    -- explains it. Computing purely from other_paid (which is correctly
    -- 0 for that case, since auto_create_payment_on_invoice_paid's own
    -- NOT EXISTS guard only fires when no completed payment exists yet)
    -- handles both cases correctly with one rule: a real prior overpay
    -- (other_paid already >= invoice_amount) is still rejected, and the
    -- single explanatory payment for a status-only transition is not.
    IF invoice_amount IS NOT NULL AND (other_paid + NEW.amount) > invoice_amount THEN
      IF other_paid >= invoice_amount THEN
        RAISE EXCEPTION 'Invoice is already fully paid' USING ERRCODE = '23505';
      END IF;
      RAISE EXCEPTION 'Payment exceeds remaining invoice balance' USING ERRCODE = '22003';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger already exists (BEFORE INSERT OR UPDATE ON public.payments,
-- EXECUTE FUNCTION prevent_payment_after_invoice_settled) from
-- 20261014000002; CREATE OR REPLACE FUNCTION above is sufficient, no need
-- to re-create it.

-- Fix (part 4 — fabricated payment via direct invoice-status update):
-- confirmed LIVE against production (read-only inspection, this session) —
-- "Users can update invoices in their company" (20260812000008) lets any
-- authenticated company member UPDATE any column on an invoice, with no
-- WITH CHECK restricting which status transitions are allowed. A live,
-- enabled trigger (`trigger_auto_payment_on_invoice_paid`) calls
-- auto_create_payment_on_invoice_paid(), which — whenever invoices.status
-- transitions to 'paid' and no completed payment exists yet for that
-- invoice — INSERTs a brand-new 'completed' payment for the FULL invoice
-- amount, payment_method 'bank_transfer', with no real payment having
-- occurred. Net effect: any company member can fabricate a fully-paid
-- invoice and a matching fake payment record via one direct
-- `supabase.from('invoices').update({status:'paid'})` call that bypasses
-- register_invoice_payment entirely.
--
-- This is NOT reachable through the actual product UI today:
-- useUpdateInvoiceStatus() (src/hooks/api/useFinance.ts) already routes a
-- 'paid' status change through register_invoice_payment() for the
-- remaining balance, not a raw invoices UPDATE — checked directly in the
-- app code, not assumed. It IS reachable by anyone calling the REST API
-- directly (the same class of gap as parts 1–3: a direct-write bypass of
-- the safe RPC path, not a flaw in the app itself).
--
-- Fix: require public.is_company_admin(auth.uid()) or a service-role
-- caller before auto_create_payment_on_invoice_paid() fabricates a
-- payment. This mirrors the admin-only-reversal pattern from part 3 and
-- leaves the legitimate path (register_invoice_payment, which inserts the
-- real payment row BEFORE updating invoice status, so this trigger's own
-- `NOT EXISTS` guard already makes it a no-op there) completely
-- unaffected — verified by reading register_invoice_payment's body
-- directly from production via the same read-only session.

CREATE OR REPLACE FUNCTION public.auto_create_payment_on_invoice_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only fire when status changes TO 'paid'
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    -- Check if a payment already exists for this invoice
    IF NOT EXISTS (SELECT 1 FROM public.payments WHERE invoice_id = NEW.id AND status = 'completed') THEN
      IF auth.role() <> 'service_role' AND NOT public.is_company_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Only a company admin can mark an invoice paid without a registered payment' USING ERRCODE = '42501';
      END IF;
      INSERT INTO public.payments (company_id, invoice_id, amount, status, payment_method, created_by, paid_at)
      VALUES (NEW.company_id, NEW.id, NEW.amount, 'completed', 'bank_transfer', NEW.created_by, COALESCE(NEW.paid_at, now()));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger already exists (trigger_auto_payment_on_invoice_paid, BEFORE/AFTER
-- on public.invoices — confirmed live — EXECUTE FUNCTION
-- auto_create_payment_on_invoice_paid) from 20260812000007; CREATE OR
-- REPLACE FUNCTION above is sufficient.

-- Hardening (matches the Supabase Security Advisor's own recommendation,
-- confirmed via get_advisors(type: security) against production this
-- session — WARN: authenticated_security_definer_function_executable /
-- anon_security_definer_function_executable, both listing every
-- SECURITY DEFINER function including these trigger functions as directly
-- callable via /rest/v1/rpc/<name>). These are pure trigger bodies
-- (`RETURNS trigger`) — Postgres already refuses to execute them outside
-- trigger context ("trigger functions can only be called as triggers"),
-- so this is not independently exploitable, but revoking EXECUTE closes
-- the permission-layer gap too, consistent with the principle used
-- throughout this fix (don't rely on one layer alone).
REVOKE EXECUTE ON FUNCTION public.auto_mark_invoice_paid() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.auto_create_payment_on_invoice_paid() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.prevent_payment_after_invoice_settled() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.prevent_cross_tenant_payment_invoice() FROM authenticated, anon, public;
