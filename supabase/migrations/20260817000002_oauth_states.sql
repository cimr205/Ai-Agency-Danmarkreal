-- Short-lived CSRF state for browser-redirect OAuth flows (Dinero authorization
-- code redirect, e-conomic app-installation redirect) where the callback is a
-- plain GET with no Authorization header to derive company_id from.
-- Only service-role edge functions touch this table.

CREATE TABLE public.oauth_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    provider text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    PRIMARY KEY (id)
);

ALTER TABLE public.oauth_states
  ADD CONSTRAINT oauth_states_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies: only the service-role key (used exclusively by edge functions) may read/write this table.
