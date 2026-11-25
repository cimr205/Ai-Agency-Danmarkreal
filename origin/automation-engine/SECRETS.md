# ORIGIN secrets: where each secret lives

Rule: a secret has **one** home. It is never placed in this repository, workflow JSON, commits, logs or chat.
`.env.example` contains names only. `.env` is git-ignored (root `.gitignore`: `.env`, `.env*`), with an exception for `origin/automation-engine/.env.example`.

## Where secrets live
| Secret | Home | Who uses it | Status 2026-11-25 |
|---|---|---|---|
| DB role `origin_app` password | **n8n Credential** "Postgres account" (rename it to `Railway Postgres - origin_app`) | All Postgres nodes in A, B/C/E, D | in use |
| DB superuser `postgres` password | **Railway Variables**, service `Postgres` (`POSTGRES_PASSWORD`, plus derived `PGPASSWORD`, `DATABASE_URL`, `DATABASE_PUBLIC_URL`) | Migrations and backups only, run by an operator | rotated 2026-11-25 |
| OpenRouter API key | **n8n Credential** (type OpenRouter, or Header Auth `Authorization: Bearer …`) | Future trend-analysis workflow | not created (blocker) |
| Meta App Secret + app access token | **n8n Credential** "Facebook Graph API (App)", which holds both the app secret and the access token | Future Instagram/Facebook workflows (appsecret_proof, webhook signature check) | not created (blocker) |
| Meta page / Instagram account tokens (9 connections) | **n8n Credential**, one per brand account. The DB only stores the credential **name** in `social_connections.credential_ref` | Future workflows | not created |
| Backup destination keys | **Railway Variables** on the future backup-runner service, as `ORIGIN_BACKUP_*` | Scheduled backup | not created |
| Local operator copy of `origin_app` password | macOS Keychain `origin-app-db-sunny-perception` | `tests/run-as-origin-app.mjs` only | exists; delete it when no longer needed |

### Why this split
- **n8n Credentials** are stored encrypted by n8n. Workflows refer to them by **id**, so exports and workflow JSON never contain the value, and n8n hides credential values in execution data.
- **Railway Variables** hold secrets that only a server process reads. Mark them **sealed** in the Railway dashboard: the value can no longer be shown in the UI or API, but it still reaches the service at runtime.
- **The database** stores no secrets, only references (`credential_ref`) and status.

## Never
- Never type tokens into HTTP Request URLs or headers by hand. Use the credential instead, so the token does not end up in execution data.
- Never paste a secret into chat or a ticket, or commit a workflow export that contains one.
- Never use `console.log` on a URL or object that contains a secret. The scripts here redact DB URLs before printing.

## Rotation
| Secret | How |
|---|---|
| `origin_app` | `ALTER ROLE origin_app PASSWORD …` as admin, then update the n8n credential, then test with `tests/run-as-origin-app.mjs` |
| `postgres` | `ALTER ROLE postgres PASSWORD …`, then `railway variable set POSTGRES_PASSWORD --stdin -s Postgres --skip-deploys`. Verify that the old password is refused. Done 2026-11-25 |
| OpenRouter / Meta | Create the new key at the provider, update the n8n credential, revoke the old key at the provider |

## History check (2026-11-25)
`tools/scan-secrets.py` scanned all 523 commits on every branch. It found 0 real secrets and 7 false positives:
- base64 data in vendored CSS/HTML that looks like Meta tokens
- a runtime-generated test key in `google_test.ts`
- a test JWT in `sentry-scrub.test.ts`
- a test value in `webhookSignatures.test.ts`

No real `.env` file has ever been committed. Nothing needs to be rewritten.
Run it again with `python3 origin/automation-engine/tools/scan-secrets.py` from the repo root. Output is always masked.
