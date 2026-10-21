-- get_invitation_by_token was never updated when invitations.token was
-- dropped in favor of token_hash (see 20260922000002). It still queried
-- i.token, a column that no longer exists, so every call errored and the
-- /invite accept-preview page showed "Ugyldigt invitation-link" for every
-- real invitation — the entire invite-acceptance UI flow was broken.

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token text)
 RETURNS TABLE(email text, role app_role, status text, expires_at timestamp with time zone, company_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT i.email, i.role, i.status, i.expires_at, c.name
  FROM public.invitations i
  JOIN public.companies c ON c.id = i.company_id
  WHERE i.token_hash = encode(extensions.digest(_token, 'sha256'), 'hex')
$function$;
