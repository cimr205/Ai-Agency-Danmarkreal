# Workflow scheduler deployment

The durable worker is drained every five minutes by `.github/workflows/workflow-scheduler.yml`.
Configure the same high-entropy `WORKFLOW_DRAIN_SECRET` in the deployed Supabase Edge Function and in GitHub Actions. Add `WORKFLOW_DRAIN_URL` as the full deployed `workflow-runner` URL.

The scheduler has a non-overlapping GitHub concurrency group, three bounded HTTP retries, and a stable worker identifier per run. Database leases and side-effect receipts remain the authoritative concurrency and idempotency controls. Never use the Supabase service-role key as the scheduler secret.
