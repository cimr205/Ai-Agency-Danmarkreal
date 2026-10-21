#!/usr/bin/env bash
# Sources .env.e2e.local (gitignored) and execs the given command with those
# vars in the environment — so secrets stay in the file and are never printed.
#
#   bash scripts/e2e/with-env.sh node scripts/e2e/setup-tenants.mts
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${E2E_ENV_FILE:-$ROOT/.env.e2e.local}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[with-env] BLOCKED: $ENV_FILE not found. Copy .env.e2e.example → .env.e2e.local and fill it." >&2
  exit 2
fi
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
exec "$@"
