-- ORIGIN 002: trend intelligence (additive only).
-- Adds brands, social connections, trend signals + metric snapshots, candidate scores and an audit log.
-- Creates no data, changes no existing table, drops nothing. Rollback: 002_trend_intelligence.down.sql.
-- Tenant isolation: same policy as jobs/observations (app.tenant_id). Note that a superuser or a
-- BYPASSRLS role ignores RLS, so the workflows must keep filtering on tenant_id until they run as a
-- dedicated non-bypass role.

BEGIN;

CREATE TABLE IF NOT EXISTS brands (
  id          text PRIMARY KEY CHECK (id ~ '^brand_[a-z0-9_]{1,56}$'),
  tenant_id   text NOT NULL REFERENCES tenants(id),
  name        text NOT NULL,
  locale      text NOT NULL CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, name)
);

-- One row per brand x platform (3 brands x 3 platforms = 9). Never stores a secret:
-- credential_ref is the NAME of the n8n credential that holds the token.
CREATE TABLE IF NOT EXISTS social_connections (
  id                  bigserial PRIMARY KEY,
  tenant_id           text NOT NULL REFERENCES tenants(id),
  brand_id            text NOT NULL,
  platform            text NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook')),
  status              text NOT NULL DEFAULT 'not_connected'
                        CHECK (status IN ('not_connected', 'pending_review', 'connected', 'revoked', 'error')),
  external_account_id text,
  credential_ref      text,
  scopes              text[] NOT NULL DEFAULT '{}',
  can_read_insights   boolean NOT NULL DEFAULT false,
  can_publish         boolean NOT NULL DEFAULT false,
  last_checked_at     timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (brand_id, tenant_id) REFERENCES brands(id, tenant_id),
  UNIQUE (tenant_id, brand_id, platform),
  CHECK (status <> 'connected' OR (external_account_id IS NOT NULL AND credential_ref IS NOT NULL))
);

-- A video seen through an official API. Only fields the API returned; nothing estimated.
CREATE TABLE IF NOT EXISTS trend_signals (
  id            bigserial PRIMARY KEY,
  tenant_id     text NOT NULL REFERENCES tenants(id),
  brand_id      text,
  platform      text NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'facebook')),
  source_api    text NOT NULL,               -- e.g. ig_hashtag_top_media, ig_business_discovery, tiktok_display_video_list
  source_query  text,                        -- hashtag / account handle used, for traceability
  external_id   text NOT NULL,
  permalink     text,
  author_handle text,
  caption       text,
  posted_at     timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  is_own_content boolean NOT NULL DEFAULT false, -- own content has insights (retention); third-party content does not
  dedupe_key    text NOT NULL,
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, dedupe_key),
  FOREIGN KEY (brand_id, tenant_id) REFERENCES brands(id, tenant_id)
);

-- Metric snapshots over time (for engagement velocity / trend growth). metrics holds exactly what the API returned.
CREATE TABLE IF NOT EXISTS signal_snapshots (
  id           bigserial PRIMARY KEY,
  tenant_id    text NOT NULL,
  signal_id    bigint NOT NULL,
  captured_at  timestamptz NOT NULL,
  source_api   text NOT NULL,
  metrics      jsonb NOT NULL CHECK (jsonb_typeof(metrics) = 'object'),
  raw_ref      text,                          -- request id / API response reference
  FOREIGN KEY (signal_id, tenant_id) REFERENCES trend_signals(id, tenant_id),
  UNIQUE (signal_id, captured_at)
);

-- One explainable score per signal per scoring version (idempotent re-runs).
CREATE TABLE IF NOT EXISTS candidate_scores (
  id                 bigserial PRIMARY KEY,
  tenant_id          text NOT NULL,
  signal_id          bigint NOT NULL,
  brand_id           text,
  scoring_version    text NOT NULL,
  analyst_model      text,                    -- OpenRouter model id used for multimodal analysis
  evaluator_model    text,                    -- independent evaluator model id
  feature_scores     jsonb NOT NULL,          -- per feature: score, source, evidence, weight, contribution
  total_score        numeric(3,1) NOT NULL CHECK (total_score BETWEEN 0 AND 10),
  confidence         numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence_quality   numeric(3,1) NOT NULL CHECK (evidence_quality BETWEEN 0 AND 10),
  passed             boolean NOT NULL,
  gate_reasons       text[] NOT NULL DEFAULT '{}',
  explanation        text[] NOT NULL DEFAULT '{}',
  created_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (signal_id, tenant_id) REFERENCES trend_signals(id, tenant_id),
  UNIQUE (tenant_id, signal_id, scoring_version),
  CHECK (NOT passed OR total_score >= 8.0)
);

-- Append-only audit trail.
CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  tenant_id   text NOT NULL REFERENCES tenants(id),
  actor       text NOT NULL,                  -- workflow name / execution id / user
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  detail      jsonb NOT NULL DEFAULT '{}',
  at          timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END $$;
DROP TRIGGER IF EXISTS audit_log_no_change ON audit_log;
CREATE TRIGGER audit_log_no_change BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();

CREATE INDEX IF NOT EXISTS candidate_scores_passed_idx ON candidate_scores (tenant_id, passed, total_score DESC);
CREATE INDEX IF NOT EXISTS signal_snapshots_signal_idx ON signal_snapshots (signal_id, captured_at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['brands','social_connections','trend_signals','signal_snapshots','candidate_scores','audit_log'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_isolation') THEN
      EXECUTE format($p$CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true))$p$, t);
    END IF;
  END LOOP;
END $$;

COMMIT;
