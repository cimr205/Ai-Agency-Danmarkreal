#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# start.sh — Installer alt og start lead-gen servicen.
#
# Kør én gang:
#   cd scraper && bash start.sh
#
# Kør derefter i en anden terminal:
#   npm run dev
#
# CRM'et sender nu alle API-kald til denne service på :8001,
# som håndterer /v1/lead-gen/* selv og proxyer alt andet
# videre til api.aiagencydanmark.dk.
# ─────────────────────────────────────────────────────────────
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_LOCAL="$REPO_ROOT/.env.local"

echo "▶ Installing Python dependencies..."
pip install -r requirements.txt --quiet

echo "▶ Installing Playwright Chromium browser..."
playwright install chromium --with-deps

# Point the CRM frontend at this service
if ! grep -q "VITE_API_BASE_URL" "$ENV_LOCAL" 2>/dev/null; then
  echo "" >> "$ENV_LOCAL"
  echo "# Lead-gen microservice (set by scraper/start.sh)" >> "$ENV_LOCAL"
  echo "VITE_API_BASE_URL=http://localhost:8001/api" >> "$ENV_LOCAL"
  echo "✓ Added VITE_API_BASE_URL to $ENV_LOCAL"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Lead-gen service starting on :8001"
echo "  Open a 2nd terminal and run:  npm run dev"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$REPO_ROOT/scraper"
uvicorn api:app --host 0.0.0.0 --port 8001 --reload
