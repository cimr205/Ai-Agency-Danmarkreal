#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# start.sh — installer og start lead-engine (Node.js pipeline)
#
# Terminal 1:  cd lead-engine && bash start.sh
# Terminal 2:  npm run dev   (i roden af projektet)
# ─────────────────────────────────────────────────────────────
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_LOCAL="$REPO_ROOT/.env.local"

echo "▶ Installing Node dependencies..."
npm install --silent

echo "▶ Installing Playwright Chromium..."
npx playwright install chromium --with-deps

# Sæt frontend til at bruge denne service
if ! grep -q "VITE_API_BASE_URL" "$ENV_LOCAL" 2>/dev/null; then
  echo "" >> "$ENV_LOCAL"
  echo "VITE_API_BASE_URL=http://localhost:8001/api" >> "$ENV_LOCAL"
  echo "✓ Wrote VITE_API_BASE_URL to $ENV_LOCAL"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Lead-engine starting on :8001"
echo "  Open a 2nd terminal and run: npm run dev"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$REPO_ROOT/lead-engine"
npm run dev
