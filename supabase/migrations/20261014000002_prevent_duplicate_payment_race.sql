-- Found via live parallel-request adversarial testing (P2/P10): the direct
-- REST insert path for payments has no idempotency/dedup protection at all
-- (unlike the Stripe webhook path, which is protected by
-- provider_webhook_receipts' unique external_event_id). Five genuinely
-- concurrent POSTs recording a full-amount "completed" payment against the
-- same 1000 kr invoice were ALL accepted — 5 payment rows, 5000 kr total
-- recorded against a 1000 kr invoice. The invoice correctly showed 'paid',
-- but the company's own payments ledger was inflated 5x, which would
-- corrupt revenue reporting and any accounting-sync integration.
--
-- Fix: a BEFORE INSERT/UPDATE trigger that locks the target invoice row
-- (SELECT ... FOR UPDATE) and rejects a new/updated 'completed' payment if
-- the invoice is already 'paid' or 'cancelled'. The row lock is what makes
-- this safe under real concurrency — without it, two transactions could
-- both read 'draft' before either commits (the exact race just
-- reproduced). This also directly covers "payment after cancel/void".
--
-- Legitimate partial payments (e.g. 500 now, 500 later) are unaffected:
-- they're only rejected once the invoice is already fully settled.

CREATE OR REPLACE FUNCTION public.prevent_payment_after_invoice_settled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  invoice_status text;
BEGIN
  IF NEW.status = 'completed' THEN
    SELECT status INTO invoice_status FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;

    IF invoice_status = 'paid' THEN
      RAISE EXCEPTION 'Invoice is already fully paid' USING ERRCODE = '23505';
    END IF;

    IF invoice_status = 'cancelled' THEN
      RAISE EXCEPTION 'Cannot record a payment against a cancelled invoice' USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_payment_after_invoice_settled ON public.payments;
CREATE TRIGGER trg_prevent_payment_after_invoice_settled
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_payment_after_invoice_settled();
