# ORIGIN Automation Engine

Status checked 2026-11-25. Execution ids and query results are in the session report.

## Where it runs
- **Workflows:** n8n Cloud `aiagencydanmark.app.n8n.cloud`. Schedules run server-side, so no local computer is needed.
- **Data:** Railway project `sunny-perception`, service `Postgres` (PG 18.6), reached by n8n Cloud through the public TCP proxy.
- **Railway n8n (2.48.8, service `n8n` + `Postgres-WsQb`):** running but holds 0 workflows. It is idle and redundant today.

## Workflows (n8n Cloud)
| Workflow | id | State |
|---|---|---|
| A System Heartbeat | 0USldQyZ68AnFTXl | tested (exec 103), not published |
| B/C/E Research, Analysis Queue, Notifications | nggIC6MlHS39DswJ | tested (exec 104), unpublished 2026-11-25 |
| D Failure Recovery | LkLmXnfHSXglkM0U | published hourly, fixed 2026-11-25 |

## Files
- `workflows/D-failure-recovery.json`: fixed D, as tested.
- `sql/002_trend_intelligence.sql`: additive schema for brands, the 9 social connections, trend signals, metric snapshots, explainable candidate scores and an append-only audit log. RLS uses the same policy as the existing tables. **Applied to production 2026-11-25**, after a rolled-back dry-run.
- `sql/002_trend_intelligence.down.sql`: rollback that removes only what 002 created.
- `sql/003_origin_app_role.sql`: least-privilege role `origin_app` (no superuser, no BYPASSRLS). **Applied 2026-11-25.** Verified: without a tenant it sees 0 jobs, as tenant_test it sees only its own jobs, and it cannot create tables. The workflows still use `postgres` until they are moved over.
- `scoring/score.mjs`: deterministic 0–10 score. Metrics only come from official APIs. Judgement features need an independent evaluator, and the lower of the two scores is used. A video passes at 8.0 or higher, with gates for evidence coverage, confidence, brand safety and copyright.

## Tests
```
node --test origin/automation-engine/scoring/score.test.mjs   # 12 tests
```
The migration tests (16 checks on PGlite) are in the session report.

## Known gaps
- Third-party video metrics are limited by the platforms. TikTok Research API is non-commercial only. Instagram hashtag search returns no view counts and allows 30 hashtags per 7 days. Retention, replays and first-3-seconds data exist only for **own** content, through insights.
- No Meta, TikTok or OpenRouter credentials exist in n8n.
- The workflows still connect as `postgres` (superuser with BYPASSRLS). To move them to `origin_app`, each query must first set `app.tenant_id`, and the cross-tenant scheduler queries (List tenants, Find recoverable jobs) need a design.
- Railway volume backups and their restore have not been verified.
