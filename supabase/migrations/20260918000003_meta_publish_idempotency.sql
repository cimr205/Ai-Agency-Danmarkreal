-- meta-publish-campaign makes four sequential, real, spending Meta API
-- calls (campaign, ad set, creative, ad) with nothing tracking whether a
-- given publish attempt has already run — a network retry or a second
-- click re-runs all four and creates a duplicate live campaign. Same
-- idempotency-key pattern already used for payments and email delivery
-- jobs elsewhere in this schema.

CREATE TABLE public.meta_campaign_publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  request_payload jsonb NOT NULL,
  result jsonb,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (company_id, idempotency_key)
);

CREATE INDEX meta_campaign_publish_jobs_company_idx ON public.meta_campaign_publish_jobs (company_id, created_at DESC);

ALTER TABLE public.meta_campaign_publish_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view their publish jobs" ON public.meta_campaign_publish_jobs
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

-- No client INSERT/UPDATE policy: only meta-publish-campaign (service role) writes here.
REVOKE INSERT, UPDATE, DELETE ON public.meta_campaign_publish_jobs FROM authenticated;
REVOKE ALL ON public.meta_campaign_publish_jobs FROM anon;
