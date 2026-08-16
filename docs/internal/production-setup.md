# Production Setup (CRM + HR)

## Overview
- CRM frontend: Vite app in `src/`
- CRM backend: Node/TypeScript in `server/`
- HRMS backend: Django in `hr/`

These run as separate services in production.

---

## CRM Frontend (Lovable)
1. Connect this GitHub repo in Lovable.
2. Set the frontend root to repo root (Vite uses `src/`).
3. Build command:
   - `npm install`
   - `npm run build`
4. Output:
   - `dist/`

---

## CRM Backend (Node)
1. Environment variables (server):
   - `PORT`
   - `GOOGLE_CLIENT_ID` (optional)
   - `GOOGLE_CLIENT_SECRET` (optional)
   - `GOOGLE_REDIRECT_URI` (optional)
2. Run:
   ```bash
   cd server
   npm install
   npm run build
   node dist/index.js
   ```
3. Persisted data is stored in `server/data.json`.

---

## HRMS (Django)
1. Environment:
   - Use `hr/.env.dist` as base.
2. Run:
   ```bash
   cd hr
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   cp .env.dist .env
   python manage.py migrate
   python manage.py runserver 0.0.0.0:8000
   ```

---

## Notes
- `.env` files are ignored in git.
- CRM and HR are independent services; use a reverse proxy in production if you want a single domain.

