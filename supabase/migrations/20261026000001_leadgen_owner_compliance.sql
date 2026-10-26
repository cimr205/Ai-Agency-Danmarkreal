-- Lead-gen chat: owner validation, compliance flags, radius/confirmation state, dedupe indexes.
-- See DECISIONS.md section 5 for rationale.

ALTER TABLE public.lead_gen_results
  ADD COLUMN IF NOT EXISTS owner_name text,
  ADD COLUMN IF NOT EXISTS owner_role text,
  ADD COLUMN IF NOT EXISTS owner_confidence integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS owner_sources text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reklamebeskyttet boolean,
  ADD COLUMN IF NOT EXISTS samtykke_status text DEFAULT 'ukendt',
  ADD COLUMN IF NOT EXISTS cvr_status text,
  ADD COLUMN IF NOT EXISTS normalized_phone text,
  ADD COLUMN IF NOT EXISTS normalized_domain text;

ALTER TABLE public.lead_gen_results
  ADD CONSTRAINT lead_gen_results_samtykke_status_check
  CHECK (samtykke_status IN ('ukendt', 'givet', 'nej'));

-- Cross-session dedupe (mission item #24): one lead per company per tenant, by name+city or
-- normalized phone/domain. Partial indexes (not UNIQUE constraints) since dedupe is advisory —
-- merge logic lives in application code, these just make existing-lead lookups fast.
CREATE INDEX IF NOT EXISTS idx_lead_gen_results_dedupe_name_city
  ON public.lead_gen_results (company_id, lower(company_name), lower(coalesce(city, '')));

CREATE INDEX IF NOT EXISTS idx_lead_gen_results_dedupe_phone
  ON public.lead_gen_results (company_id, normalized_phone)
  WHERE normalized_phone IS NOT NULL AND normalized_phone <> '';

CREATE INDEX IF NOT EXISTS idx_lead_gen_results_dedupe_domain
  ON public.lead_gen_results (company_id, normalized_domain)
  WHERE normalized_domain IS NOT NULL AND normalized_domain <> '';

ALTER TABLE public.lead_gen_sessions
  ADD COLUMN IF NOT EXISTS radius_km integer,
  ADD COLUMN IF NOT EXISTS awaiting_confirmation_type text,
  ADD COLUMN IF NOT EXISTS awaiting_confirmation_payload jsonb DEFAULT '{}';

ALTER TABLE public.lead_gen_sessions
  ADD CONSTRAINT lead_gen_sessions_confirmation_type_check
  CHECK (awaiting_confirmation_type IS NULL OR awaiting_confirmation_type IN ('radius_expand', 'save_confirm'));

COMMENT ON COLUMN public.lead_gen_results.reklamebeskyttet IS
  'NULL = unknown from CVR. Application code must NEVER treat NULL as "safe to contact".';
COMMENT ON COLUMN public.lead_gen_results.owner_confidence IS
  '0-100. Below enrichment-defined threshold, UI must show "ikke valideret", never a guessed name.';
