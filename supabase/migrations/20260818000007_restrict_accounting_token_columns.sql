-- AccountingConnections.tsx does `.select('*')` on dinero_connections and
-- economic_connections to render a simple "connected" badge, but '*' also
-- pulls the raw OAuth access_token/refresh_token (Dinero) and
-- agreement_grant_token (e-conomic) into the browser - live credentials
-- for the company's accounting system, sitting in React state/devtools/
-- memory for no functional reason. Restrict SELECT to the non-secret
-- columns the UI actually needs; the sync edge functions use the
-- service_role key and are unaffected by these grants.

REVOKE SELECT ON public.dinero_connections FROM authenticated;
GRANT SELECT (id, company_id, dinero_organization_id, dinero_organization_name, status, last_synced_at, last_sync_error, connected_by, connected_at, disconnected_at, created_at, updated_at)
  ON public.dinero_connections TO authenticated;

REVOKE SELECT ON public.economic_connections FROM authenticated;
GRANT SELECT (id, company_id, agreement_number, company_name, status, last_synced_at, last_sync_error, connected_by, connected_at, disconnected_at, created_at, updated_at)
  ON public.economic_connections TO authenticated;
