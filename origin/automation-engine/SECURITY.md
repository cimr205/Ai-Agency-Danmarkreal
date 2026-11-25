# ORIGIN database and tenant security

State: 2026-11-25, Railway `sunny-perception` / service `Postgres` (PostgreSQL 18.6).

## Roles
| Role | Login | Superuser | BYPASSRLS | Purpose |
|---|---|---|---|---|
| `postgres` | yes | **yes** | **yes** | Admin and migrations. **Still used by the n8n credential** (see "Remaining superuser dependencies") |
| `origin_app` | yes | no | no | Intended workflow role. Password only in the macOS keychain (`origin-app-db-sunny-perception`) |
| `origin_scheduler` | **no** | no | no | Owner of the two scheduler functions only. Nobody can log in as it, and `origin_app` is not a member |

## Grants (live)
| Role | Object | Privileges |
|---|---|---|
| origin_app | jobs, job_attempts, notifications, observations, automation_errors, brands, social_connections, trend_signals, signal_snapshots, candidate_scores | SELECT, INSERT, UPDATE |
| origin_app | audit_log | SELECT, INSERT (no UPDATE/DELETE; a trigger also blocks them) |
| origin_app | heartbeat_log | SELECT, INSERT, UPDATE, DELETE (system table, no tenant) |
| origin_app | tenants | **none**: lists tenants only through `origin_list_automation_tenants()` |
| origin_app | `origin_list_automation_tenants()`, `origin_find_recoverable_jobs(int)`, `prune_heartbeat_log()` | EXECUTE |
| origin_scheduler | tenants (id, automation_enabled) | SELECT |
| origin_scheduler | jobs (id, tenant_id, job_key, job_type, status, attempt_count, max_attempts, run_after, lease_expires_at, last_error) | SELECT |
| origin_scheduler | jobs (status, last_error, lease_owner, lease_expires_at, updated_at) | UPDATE |
| origin_scheduler | notifications (tenant_id, job_id, reason) / (job_id, reason) | INSERT / SELECT (needed by ON CONFLICT) |

EXECUTE on both scheduler functions is revoked from PUBLIC.

## RLS
All tenant tables have **forced** RLS with the policy `tenant_isolation`: `tenant_id = current_setting('app.tenant_id', true)`, for both USING and WITH CHECK. The tables are jobs, job_attempts, notifications, observations, automation_errors, brands, social_connections, trend_signals, signal_snapshots, candidate_scores and audit_log.

Extra policies exist only for `origin_scheduler`: `scheduler_maintenance` on jobs, and `scheduler_insert` on notifications (INSERT only).

No RLS on `tenants` (origin_app has no access to it) or on `heartbeat_log` (no tenant column).

## How tenant scoping works in the workflows
Every tenant-scoped query starts with:
```sql
SELECT 1 WHERE set_config('app.tenant_id', $tenant, true) IS NULL;
```
This returns no row, so it adds nothing to the n8n node output. `is_local = true` means the setting ends when the query does, and a test confirmed it does not leak to the next query on a pooled connection. All 18 queries are in `workflows/tenant-scoped-queries.json`.

**Where `tenant_id` comes from.** It always comes from data the workflow validated, never from free text:
- **D:** from `origin_find_recoverable_jobs` (database) or `Manual test input` (database). `Prepare job` then checks it against `^tenant_[a-z0-9_]{1,56}$` and requires `job_key` to start with `tenant_id:`.
- **B/C/E:** from `origin_list_automation_tenants()` (database). `Validate response` only accepts tenants from that list.
- No workflow has a webhook or form trigger, so there is no external input path.

## Cross-tenant jobs (scheduler)
| Old query | New | Access control |
|---|---|---|
| B/C/E "List tenants": `SELECT id FROM tenants WHERE automation_enabled` | `SELECT id FROM origin_list_automation_tenants()` | SECURITY DEFINER owned by origin_scheduler. Returns ids only |
| D "Find recoverable jobs": a cross-tenant UPDATE+SELECT that returned payloads | `SELECT tenant_id, job_key FROM origin_find_recoverable_jobs(25)`, then the new node "Load recovery job" loads the payload **under tenant RLS** | Input check (`1 <= p_limit <= 100`), only `job_type='recovery'`, only tenants with automation on, returns no payload |

## Remaining superuser dependencies
1. **n8n credential "Railway Postgres - Automation Engine" (`postgres`).** Every Postgres node in A, B/C/E and D uses it, and so do the three inactive `BACKUP 2026-11-19` copies. RLS is therefore not enforced for n8n yet. The queries are ready: switching is a credential change per node.
2. That superuser is reachable over the public TCP proxy (`roundhouse.proxy.rlwy.net:17500`).
3. Migrations run as `postgres`, which is correct and intended.

## Rollback
| Change | Rollback |
|---|---|
| Migration 004 | `sql/004_tenant_security.down.sql`: drops the functions, policies and role, disables RLS on automation_errors, restores origin_app's tenants grant. No data is lost |
| Migration 003 | `REVOKE ALL ... FROM origin_app; DROP ROLE origin_app;` (see the file header) |
| Migration 002 | `sql/002_trend_intelligence.down.sql`. Drops only the new tables, which are empty today |
| Workflow D | restore n8n version `9677a153-1d56-4ed0-b61a-579c627b5997` (before tenant scoping) |
| Workflow B/C/E | restore n8n version `9940eca5-25ea-49ef-9850-f4f0fc4ca71b` |

## Backup and restore
- **Railway volume backups:** NOT VERIFIED. The Railway API refuses the CLI token ("Not Authorized"). Check the service's Backups tab in the Railway dashboard.
- **Logical backup (verified 2026-11-25):**
  - `backup/logical-backup.mjs` reads schema and data read-only from one snapshot, with no secrets.
  - `backup/restore-verify.mjs` restores into an empty, isolated PostgreSQL 18.7 and verifies it. It refuses a target that already has tables.
  - Result: 13/13 tables with identical row counts and checksums; 55 constraints, 13 policies, 4 functions, 1 trigger and the forced RLS flags were all restored; origin_app isolation works on the restored copy. **21/21 passed.**
  - The backup is not stored anywhere permanent yet. A scheduled run to off-site storage is still missing.
