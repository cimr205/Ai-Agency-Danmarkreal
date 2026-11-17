# Growth OS analytics: GA4 + Search Console (2026-11-17)

## How it works
- **Server-side only.** The Growth OS Railway service reads Google data with one read-only
  service account (`GOOGLE_SERVICE_ACCOUNT_JSON`, scopes `analytics.readonly` and
  `webmasters.readonly`). No Google credential reaches the browser.
- **Per company.** A company's owner/company_admin requests a connection (GA4 property id
  and/or Search Console site) in Growth OS → Analytics. It starts `pending`; only a
  system_admin can activate it, after checking that the property belongs to that company.
  Property ids and sites are unique across companies.
- **Sync.** Every hour the service syncs active connections older than 6 h
  (`GROWTH_OS_ANALYTICS_SYNC_HOURS`). The first sync backfills 90 days; later syncs refetch the
  last 3 days. Rows are upserted on (company, day, dimensions), so nothing is counted twice.
  A 401/403/404 from Google sets the connection to `no_access` (customer must fix access);
  429/5xx/timeouts retry with backoff and keep the connection active.
- **Separate measures.** GA4 sessions (`growth_ga4_*`) and Search Console clicks (`growth_gsc_*`)
  live in separate tables and are never presented as the same thing.
- **SEO agent** (`seo.opportunities`, skill `search-console-analysis@1.0.0`): CTR gaps against the
  site's own median CTR, striking-distance queries, page traffic drops, organic landing pages with
  no key events. Proposals only (Level 1): an owner/company_admin approves, a person implements
  and marks it done, and after 28 days the agent compares 28 days before/after, labelled
  correlation. Blocked, never estimated, when there is no data.
- **Business impact** comes from the CRM (`customers.acquisition_source`/`lead_source`, paid
  invoices). Leads without a source are reported as untracked, never counted as organic.

## Setup for aiagencydanmark.dk
1. Railway → project `growth-os` → service `growth-os` → Variables: add
   `GOOGLE_SERVICE_ACCOUNT_JSON` = the full JSON key of
   `ai-agency-danmark@ai-agency-472312.iam.gserviceaccount.com`.
2. Google Cloud project `ai-agency-472312`: enable **Google Analytics Data API** (done 2026-11-14)
   and **Google Search Console API**.
3. Search Console → Settings → Users → add the service account (Restricted).
   GA4 property 533214056 already grants it access.
4. Growth OS → Analytics: enter `533214056` and `sc-domain:aiagencydanmark.dk` (or the URL-prefix
   property as it is registered), then a system_admin activates it.

## Not done
- Live Google data is unverified until steps 1–4 are done.
- No CRM lead has `acquisition_source` today, so organic leads/revenue show as untracked.
