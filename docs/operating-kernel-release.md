# Operating kernel release checklist

## Staging prerequisites

Create a separate Supabase staging project. The deployment workflow refuses the
production project ref `vbxlpxhvojlaisxcipyh`.

Configure the GitHub `staging` environment with:

- `SUPABASE_ACCESS_TOKEN`
- `STAGING_SUPABASE_PROJECT_ID=abqfhcahdcjnkzuvbunl` as an environment variable

Configure these Edge Function secrets in the staging Supabase project:

- `APP_URL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI`
- `META_TOKEN_ENCRYPTION_KEY`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_GRAPH_VERSION` (optional; defaults to `v26.0`)
- `STRIPE_SECRET_KEY` (Stripe test-mode key in staging)
- `STRIPE_PAYMENT_WEBHOOK_SECRET` (test endpoint secret in staging)
- `WORKFLOW_DRAIN_SECRET`

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`. Do not expose any service-role or provider secret
as a `VITE_` variable.

## GitHub scheduler

Repository secrets:

- `WORKFLOW_DRAIN_URL=https://PROJECT_REF.supabase.co/functions/v1/workflow-runner`
- `WORKFLOW_DRAIN_SECRET` with exactly the same value as the staging/production
  Edge Function secret for the environment being scheduled

The scheduler calls only the canonical `workflow-runner` endpoint. Gateway JWT
verification is disabled for this mixed-auth function because the scheduler
secret is not a Supabase JWT. The handler still rejects missing/wrong drain
secrets and validates Supabase user JWTs for every interactive path.

### Secure drain-secret setup

The owner must create one high-entropy value locally and install that exact
value on both sides. Do not paste it into chat, workflow files or command logs.

```bash
read -r -s RELEASE_WORKFLOW_DRAIN_SECRET
printf %s "$RELEASE_WORKFLOW_DRAIN_SECRET" | gh secret set WORKFLOW_DRAIN_SECRET
npx supabase secrets set \
  --project-ref STAGING_PROJECT_REF \
  WORKFLOW_DRAIN_SECRET="$RELEASE_WORKFLOW_DRAIN_SECRET"
unset RELEASE_WORKFLOW_DRAIN_SECRET
```

Generate the value in a password manager or with a cryptographically secure
generator (at least 32 random bytes). After staging verification, repeat the
Supabase command with the explicitly approved production project ref and keep
GitHub pointed at the matching environment. Never reuse a provider API key or
Supabase service-role key as the drain secret.

## Provider configuration

Meta webhook URL:

`https://PROJECT_REF.supabase.co/functions/v1/meta-lead-webhook`

Subscribe the staging Meta app/test page to leadgen events and use the configured
`META_WEBHOOK_VERIFY_TOKEN`. OAuth requires `ads_read`, `ads_management`, and
`business_management`.

Gmail redirect URL:

`https://PROJECT_REF.supabase.co/functions/v1/gmail-oauth-callback`

Google scopes are `gmail.readonly`, `gmail.send`, `gmail.modify`, and
`userinfo.email`. `APP_URL` must point to the staging web origin.

Stripe webhook URL:

`https://PROJECT_REF.supabase.co/functions/v1/stripe-payment-webhook`

Subscribe to `checkout.session.completed` and use Stripe test mode in staging.

## Deployment and verification

1. Run **Deploy operating kernel to staging** manually.
2. Confirm the migration list before approving the protected staging environment.
3. Run `npm run smoke:release` using the variables in `docs/release-smoke-test.md`.
4. Run one Meta test lead, one internal Gmail send/reply, one Stripe test invoice,
   one deal-won transition and one workflow drain.
5. Verify canonical events, workflow runs, step claims, timeline entries and
   absence of duplicate side effects.
6. Promote only the exact tested commit. Production deployment remains a
   separate, explicitly approved operation.
