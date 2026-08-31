-- Lets a company pick which AI provider their one connection uses.
-- Groq is an OpenAI-API-compatible provider with a genuinely free tier
-- (no payment method required) — an alternative to OpenAI for tenants who
-- don't want to add billing. One connection per company either way
-- (company_id stays unique), the provider column just says which service
-- the stored key belongs to.
alter table public.openai_accounts
  add column if not exists provider text not null default 'openai' check (provider in ('openai', 'groq'));

comment on column public.openai_accounts.provider is
  'Which OpenAI-API-compatible provider this key belongs to. "openai_accounts" predates multi-provider support; kept as the table name since every provider here speaks the OpenAI chat-completions format.';
