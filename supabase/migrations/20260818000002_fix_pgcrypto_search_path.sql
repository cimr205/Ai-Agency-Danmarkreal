-- pgcrypto is installed in the `extensions` schema on this project, but
-- create_invitation() and issue_mcp_token() are SECURITY DEFINER functions
-- with `SET search_path TO 'public'`, which doesn't include `extensions`.
-- Every call to gen_random_bytes()/digest() therefore failed with
-- "function gen_random_bytes(integer) does not exist" (42883), meaning the
-- team-invite feature (Settings > Invitations) and MCP token issuance were
-- completely broken for every company, hidden behind a generic
-- "Kunne ikke oprette invitation" toast that swallowed the real error.

CREATE OR REPLACE FUNCTION public.create_invitation(invite_email text, invite_role app_role DEFAULT 'employee'::app_role)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t text;
  cid uuid;
BEGIN
  IF NOT is_company_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to invite';
  END IF;

  SELECT company_id INTO cid FROM public.profiles WHERE user_id = auth.uid();
  IF cid IS NULL THEN
    RAISE EXCEPTION 'No company associated with your profile';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invitations
    WHERE company_id = cid AND lower(email) = lower(invite_email) AND status = 'pending' AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'A pending invitation already exists for this email';
  END IF;

  t := encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.invitations(company_id, email, role, token, invited_by, expires_at)
  VALUES (cid, lower(invite_email), invite_role, t, auth.uid(), now() + interval '7 days');

  RETURN t;
END;
$function$;

CREATE OR REPLACE FUNCTION public.issue_mcp_token(_name text)
 RETURNS TABLE(id uuid, token text, prefix text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cid uuid;
  raw text;
  full_token text;
  pfx text;
  new_id uuid;
BEGIN
  cid := get_user_company_id(auth.uid());
  IF cid IS NULL THEN RAISE EXCEPTION 'No company'; END IF;

  raw := encode(extensions.gen_random_bytes(32), 'hex');
  full_token := 'mcp_' || raw;
  pfx := substring(full_token from 1 for 12);

  INSERT INTO public.mcp_tokens (company_id, user_id, name, token_hash, token_prefix)
  VALUES (cid, auth.uid(), COALESCE(NULLIF(trim(_name),''), 'AI Client'),
          encode(extensions.digest(full_token, 'sha256'), 'hex'), pfx)
  RETURNING mcp_tokens.id INTO new_id;

  RETURN QUERY SELECT new_id, full_token, pfx;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_mcp_token(_token text)
 RETURNS TABLE(company_id uuid, user_id uuid, token_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  h text;
BEGIN
  h := encode(extensions.digest(_token, 'sha256'), 'hex');
  RETURN QUERY
    SELECT t.company_id, t.user_id, t.id
    FROM public.mcp_tokens t
    WHERE t.token_hash = h AND t.revoked_at IS NULL
    LIMIT 1;
END;
$function$;
