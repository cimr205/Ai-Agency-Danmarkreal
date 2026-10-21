-- Found via live adversarial permission-matrix testing: payments.company_id
-- is checked by RLS against the caller's own company, but nothing verified
-- that payments.invoice_id actually belongs to that same company. A user in
-- Company B could insert a payments row with company_id = B and
-- invoice_id = <any other company's invoice>. Since auto_mark_invoice_paid()
-- sums payments by invoice_id with no company filter, enough such forged
-- payments flip a victim company's invoice to 'paid' without their
-- knowledge or consent — a cross-tenant financial integrity bug.
--
-- Live-confirmed: a forged payment (company_id=B, invoice_id=<A's invoice>)
-- was successfully inserted and persisted before this fix.

CREATE OR REPLACE FUNCTION public.prevent_cross_tenant_payment_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  invoice_company_id uuid;
BEGIN
  SELECT company_id INTO invoice_company_id
  FROM public.invoices
  WHERE id = NEW.invoice_id;

  IF invoice_company_id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = '23503';
  END IF;

  IF invoice_company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'Payment company_id does not match invoice company_id' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_cross_tenant_payment_invoice ON public.payments;
CREATE TRIGGER trg_prevent_cross_tenant_payment_invoice
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_cross_tenant_payment_invoice();
