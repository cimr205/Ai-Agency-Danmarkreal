# Backend production runbook

This release hardens CRM conversion and adds durable email, atomic finance, server-side Meta
sync, and a nearby-phone call relay. Deploy it in the order below. Do not deploy only the web
bundle: the new UI intentionally stays locked until its database and Edge Function contracts
exist.

## 1. Preconditions

- Take a Supabase database backup and confirm point-in-time recovery.
- Deploy from a staging project first with a copy of the production schema.
- Confirm the migration history before pushing. This repository contains older local migration
  files that are not all recorded in the linked project's migration table. Do not use
  `supabase db push --include-all` until that history has been reconciled.
- Run the five new migrations explicitly and in order:
  1. `20260901000002_crm_conversion_hardening.sql`
  2. `20260901000003_durable_bulk_email.sql`
  3. `20260901000004_atomic_finance.sql`
  4. `20260901000005_meta_ads_sync.sql`
  5. `20260901000006_phone_device_relay.sql`
- Record those versions in migration history using the team's normal release process.

Each migration has been compiled and exercised against the linked production schema inside a
single transaction followed by `ROLLBACK`. The executable contract suite is
`supabase/tests/backend_epics_e2e.test.sql`.

## 2. Required secrets

Already used by Gmail:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Meta:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI` — exact deployed `/auth/meta/callback` URL configured in Meta
- `META_TOKEN_ENCRYPTION_KEY` — random value of at least 32 characters; back it up in the
  production secret manager because losing it makes stored Meta tokens unreadable
- `META_GRAPH_VERSION` — optional, defaults to `v26.0`

Generic provider webhook, only when an external delivery provider is enabled:

- `EMAIL_WEBHOOK_SECRET`

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge
Functions. Never put the service-role key or Meta encryption key in a `VITE_` variable.

## 3. Edge Functions

Deploy these functions after the migrations:

```text
process-campaign-email-jobs
email-provider-webhook
email-track
meta-oauth-start
meta-oauth-callback
meta-sync
meta-publish-campaign
meta-disconnect
phone-device-relay
```

`meta-oauth-callback` and `phone-device-relay` have gateway JWT verification disabled because
they accept an OAuth callback and a one-time/device credential respectively. Both perform their
own explicit authorization. `process-campaign-email-jobs`, `meta-oauth-start`, and `meta-sync`
must retain gateway JWT verification.

## 4. Durable email worker

Invoke `process-campaign-email-jobs` with the service-role JWT every minute. A request body such
as `{"limit":25}` is sufficient. Run only a small number of workers until Gmail quota and
deliverability are known. The database uses `FOR UPDATE SKIP LOCKED`, two-minute leases,
idempotency keys, exponential retry, suppression checks, and resumable campaign state.

The worker sends through the campaign owner's connected Gmail account. Attachments are uploaded
once to the private `campaign-assets` bucket and loaded once per campaign per worker batch. A
stable RFC 2822 `Message-ID` plus a Gmail search before retry reduces duplicate sends after an
uncertain network response. Gmail itself does not expose a transactional exactly-once send API,
so monitor retries and keep batch sizes conservative.

Operational alerts:

- queued/retry deliveries older than five minutes;
- processing leases older than two minutes;
- failed deliveries or disconnected Gmail accounts;
- bounce/complaint spikes and suppression growth;
- Gmail 429/403 quota responses.

## 5. Meta rollout

The migration intentionally removes readable OAuth tokens from browser-facing rows and marks old
plaintext connections `reconnect_required`. Every existing Meta user must reconnect once after
deployment. New tokens are AES-GCM encrypted and only decrypted inside Edge Functions.

After reconnecting, run `meta-sync` and verify campaigns, ad sets, creatives, ads, and daily
insights for at least one account. Confirm the account currency and timezone before enabling
campaign publishing. Alert on `meta_sync_jobs.status` values `failed` or `rate_limited`.

## 6. Phone companion rollout

The browser companion works immediately at `/:locale/phone-companion`: scan the one-time QR code,
pair, keep the page open, and approve the carrier call on the phone. It uses the phone's SIM/eSIM
and subscription; it does not purchase a platform number.

- iPhone always requires a user confirmation for a normal carrier call.
- The web companion on Android also requires a tap because browser security prevents silent
  carrier calls.
- A later native Android wrapper may advertise `direct_carrier_call=true` after explicit
  `CALL_PHONE` permission. Follow `docs/PHONE_COMPANION_PROTOCOL.md`; never advertise that
  capability from a browser.

Alert when paired devices stop heartbeating for 90 seconds. Rate-limit `claim`, `heartbeat`,
`poll`, and `event` at the gateway. Lost devices must be revoked, not merely hidden in the UI.

## 7. Smoke test after deployment

1. Convert the same lead twice and verify one customer/deal is returned both times.
2. Convert two duplicate leads concurrently and verify they resolve to the same customer.
3. Queue a scheduled email to two internal inboxes, including an attachment; restart the worker
   between recipients and confirm it resumes without duplicate recipients.
4. Replay the same payment idempotency key and verify invoice totals do not change twice.
5. Accept a quote and convert it twice; verify one invoice exists.
6. Reconnect Meta, sync, and compare one campaign's spend/impressions with Meta Ads Manager.
7. Pair both an iPhone and Android, verify stale heartbeats lock the Call button, and make one
   approved call through each phone's own SIM.
8. Check tenant isolation with users from two companies before broad rollout.

## 8. Rollback

- Roll back the web deployment first so old screens stop calling new RPCs.
- Pause the email scheduler before database rollback; in-flight Gmail sends cannot be recalled.
- Revert Edge Functions to the previous release.
- Restore the database from the release backup if a destructive rollback is required. Do not
  drop the new tables while workers are active.
- Meta users whose plaintext tokens were cleared must reconnect even after a code rollback; the
  old token values are intentionally not recoverable.
