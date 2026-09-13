# Release smoke test

Run this only against a controlled staging Supabase project with an internal
test user and provider test secrets. It sends signed no-op Meta and Stripe
events, creates and replays a Gmail OAuth state, verifies a tenant-scoped read,
and can execute one workflow in test mode.

```bash
SMOKE_SUPABASE_URL=https://PROJECT_REF.supabase.co \
SMOKE_SUPABASE_ANON_KEY=... \
SMOKE_USER_JWT=... \
SMOKE_META_APP_SECRET=... \
SMOKE_STRIPE_WEBHOOK_SECRET=... \
SMOKE_WORKFLOW_DRAIN_SECRET=... \
SMOKE_WORKFLOW_ID=... \
SMOKE_RUN_DRAIN=1 \
npm run smoke:release
```

`SMOKE_RUN_DRAIN` and `SMOKE_WORKFLOW_ID` are deliberately opt-in. Use a staging
workflow whose actions are disabled or harmless. Never place service-role keys
or customer credentials in these variables or commit their values.
