-- Support Twilio API Keys (SKxxx + secret) as an alternative to the
-- primary Account Auth Token for authenticating REST calls. API Keys are
-- independently revocable without regenerating the master Auth Token —
-- better practice than storing the primary token. Additive/nullable:
-- existing rows using account_sid+auth_token keep working unchanged.

alter table public.twilio_accounts
  add column api_key_sid text,
  add column api_key_secret text;
