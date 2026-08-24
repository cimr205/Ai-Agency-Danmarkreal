-- Accounts connected via API Key (api_key_sid/api_key_secret) don't need the
-- primary Auth Token stored at all — it's the whole point of using a key
-- instead of the master credential. Drop the NOT NULL so API-key-only rows
-- can omit it.

alter table public.twilio_accounts
  alter column auth_token drop not null;
