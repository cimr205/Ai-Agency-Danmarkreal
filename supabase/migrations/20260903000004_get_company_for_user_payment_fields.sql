-- Extends get_company_for_user() to return the new bank/payment columns
-- (20260903000003) — InvoicesPage.tsx's `Company` type comes from this
-- RPC's return shape, not the raw companies table, so the PDF generator
-- can't see the new fields until this function is updated too.
DROP FUNCTION IF EXISTS public.get_company_for_user(uuid);

CREATE FUNCTION public.get_company_for_user(_company_id uuid)
 RETURNS TABLE(id uuid, name text, cvr text, address text, phone text, email text, website text, logo_url text, industry text, company_size text, status text, mode text, onboarding_completed boolean, onboarding_step integer, compliance_checklist jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, trial_ends_at timestamp with time zone, seat_limit_trial integer, purchased_seats integer, subscription_status text, bank_name text, bank_reg_number text, bank_account_number text, iban text, swift text, payment_reference_note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF get_user_company_id(auth.uid()) <> _company_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT c.id, c.name, c.cvr, c.address, c.phone, c.email, c.website,
    c.logo_url, c.industry, c.company_size, c.status, c.mode,
    c.onboarding_completed, c.onboarding_step, c.compliance_checklist,
    c.created_at, c.updated_at, c.trial_ends_at, c.seat_limit_trial, c.purchased_seats, c.subscription_status,
    c.bank_name, c.bank_reg_number, c.bank_account_number, c.iban, c.swift, c.payment_reference_note
  FROM public.companies c WHERE c.id = _company_id;
END;
$function$;
