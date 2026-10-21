#!/usr/bin/env bash
# Applies supabase/migrations to the DEDICATED test project only.
#
# Refuses to run against production. Requires:
#   TEST_SUPABASE_DB_URL         postgres connection string of the TEST project
#   E2E_ALLOW_TEST_PROJECT=1     explicit confirmation this is a test project
# Optional (for `supabase db push` instead of raw psql):
#   TEST_SUPABASE_PROJECT_REF    test project ref  (used with: supabase link)
#   SUPABASE_ACCESS_TOKEN        CLI access token
#
# Usage:
#   TEST_SUPABASE_DB_URL=postgres://... E2E_ALLOW_TEST_PROJECT=1 bash scripts/e2e/apply-migrations.sh
set -euo pipefail

if [[ "${E2E_ALLOW_TEST_PROJECT:-}" != "1" ]]; then
  echo "[apply-migrations] BLOCKED: set E2E_ALLOW_TEST_PROJECT=1 to confirm a dedicated test project." >&2
  exit 2
fi

DB_URL="${TEST_SUPABASE_DB_URL:-}"
if [[ -z "$DB_URL" ]]; then
  echo "[apply-migrations] BLOCKED: TEST_SUPABASE_DB_URL is not set (no production fallback)." >&2
  exit 2
fi

# Guard: never a production URL.
PROD_URL="${PROD_SUPABASE_DB_URL:-}"
if [[ -n "$PROD_URL" && "$DB_URL" == "$PROD_URL" ]]; then
  echo "[apply-migrations] BLOCKED: TEST_SUPABASE_DB_URL equals PROD_SUPABASE_DB_URL." >&2
  exit 2
fi
for ref in "${VITE_SUPABASE_PROJECT_ID:-}" "${PROD_SUPABASE_PROJECT_ID:-}"; do
  if [[ -n "$ref" && "$DB_URL" == *"$ref"* ]]; then
    echo "[apply-migrations] BLOCKED: connection string contains production project id '$ref'." >&2
    exit 2
  fi
done

MIGRATIONS_DIR="$(cd "$(dirname "$0")/../../supabase/migrations" && pwd)"
echo "[apply-migrations] applying $(ls "$MIGRATIONS_DIR"/*.sql | wc -l | tr -d ' ') migrations to the TEST project…"

if command -v psql >/dev/null 2>&1; then
  for f in "$MIGRATIONS_DIR"/*.sql; do
    echo "  → $(basename "$f")"
    psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$f"
  done
  echo "[apply-migrations] done (psql)."
else
  echo "[apply-migrations] psql not found; falling back to Supabase CLI db push." >&2
  if [[ -z "${TEST_SUPABASE_PROJECT_REF:-}" ]]; then
    echo "[apply-migrations] BLOCKED: no psql and no TEST_SUPABASE_PROJECT_REF for 'supabase db push'." >&2
    exit 2
  fi
  supabase link --project-ref "$TEST_SUPABASE_PROJECT_REF"
  supabase db push --db-url "$DB_URL"
fi
