#!/usr/bin/env bash
# Sends the secrets in growth-os/service/.env.railway to the Railway service growth-os
# (values go through stdin, never printed), then deletes the file.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
file="$root/growth-os/service/.env.railway"
project=4097cddd-48c2-49bb-bf05-209af899f698
[ -f "$file" ] || { echo "no $file"; exit 1; }
sent=0
while IFS='=' read -r key value; do
  case "$key" in ''|\#*) continue;; esac
  if [ -z "$value" ]; then echo "skip $key (empty)"; continue; fi
  printf '%s' "$value" | railway variable set "$key" --stdin -p "$project" -s growth-os -e production >/dev/null
  echo "set $key"; sent=$((sent+1))
done < "$file"
[ "$sent" -gt 0 ] || { echo "nothing to send"; exit 1; }
rm -f "$file"
echo "done: $sent key(s) sent, file deleted, Railway redeploys the service"
