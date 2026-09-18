-- Same bug class already found and fixed for dinero_connections and
-- economic_connections in 20260818000007_restrict_accounting_token_columns.sql:
-- twilio_accounts' RLS policy scopes SELECT to company membership, but
-- `select('*')` on that policy also returns the live auth_token /
-- api_key_secret columns to any employee, not just admins. This table was
-- never brought in line when the accounting tables were fixed.

REVOKE SELECT ON public.twilio_accounts FROM authenticated;
GRANT SELECT (id, company_id, account_sid, friendly_name, account_type, status, balance, balance_currency, last_balance_check, created_at, updated_at)
  ON public.twilio_accounts TO authenticated;
