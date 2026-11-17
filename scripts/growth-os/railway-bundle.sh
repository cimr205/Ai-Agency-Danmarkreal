#!/usr/bin/env bash
# Assembles the minimal Railway build context for the Growth OS service: only the
# engine code (no tests, no fixtures) and the service, at their repo paths.
# Usage: scripts/growth-os/railway-bundle.sh <out-dir>    then: railway up <out-dir> ...
set -euo pipefail
out="${1:?usage: railway-bundle.sh <out-dir>}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
rm -rf "$out" && mkdir -p "$out/supabase/functions/_shared" "$out/growth-os"
rsync -a --exclude '*_test.ts' --exclude 'fixtures/' "$root/supabase/functions/_shared/growth-os" "$out/supabase/functions/_shared/"
rsync -a --exclude '*_test.ts' "$root/growth-os/service" "$out/growth-os/"
cp "$root/growth-os/service/Dockerfile" "$out/Dockerfile"
printf '{"$schema":"https://railway.com/railway.schema.json","build":{"builder":"DOCKERFILE","dockerfilePath":"Dockerfile"},"deploy":{"healthcheckPath":"/health","healthcheckTimeout":60,"restartPolicyType":"ON_FAILURE","restartPolicyMaxRetries":10}}\n' > "$out/railway.json"
echo "bundle: $out ($(find "$out" -type f | wc -l | tr -d ' ') files)"
