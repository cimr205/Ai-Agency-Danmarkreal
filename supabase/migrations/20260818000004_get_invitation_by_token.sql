-- AcceptInvite.tsx (route /invite?token=...) looks up the invitation via
-- `supabase.from('invitations').select(...).eq('token', token)`, but every
-- SELECT policy on invitations requires `authenticated`. The whole point of
-- this page is to greet a brand-new invitee who is NOT signed in yet, so the
-- lookup always failed with "Ugyldigt invitation-link" (invalid invitation
-- link) before the page could redirect them to sign up - the invite-by-email
-- flow was broken for every invitee on their first visit.
--
-- Same fix pattern as get_company_by_activation_code(): a SECURITY DEFINER
-- RPC gated by the token itself (a 32-byte random hex value, unguessable),
-- so it's safe to expose without requiring auth first.

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token text)
 RETURNS TABLE(email text, role app_role, status text, expires_at timestamptz, company_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT i.email, i.role, i.status, i.expires_at, c.name
  FROM public.invitations i
  JOIN public.companies c ON c.id = i.company_id
  WHERE i.token = _token
$function$;
