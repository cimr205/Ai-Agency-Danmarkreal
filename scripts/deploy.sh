#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== CRM Frontend ==="
cd "$ROOT_DIR"
npm install
npm run build

echo "=== CRM Backend ==="
cd "$ROOT_DIR/server"
npm install
npm run build

echo "=== HRMS (Django) ==="
cd "$ROOT_DIR/hr"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp -n .env.dist .env || true
python manage.py migrate
python manage.py collectstatic --noinput

echo "Deploy build complete."

