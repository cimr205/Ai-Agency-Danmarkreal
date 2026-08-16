# Supabase + Railway + Lovable Rebuild Guide

Denne guide matcher den nye arkitektur:

- **Frontend:** Lovable (kun frontend)
- **Backend:** Railway (Node/Express API)
- **Auth + DB:** Supabase
- **Flow:** Lovable → Railway → Supabase

---

## 1) Supabase: opret projekt + schema

1. Opret nyt Supabase projekt.
2. Kør SQL migrationen:

```sql
-- Kør filen
supabase/migrations/20260222070000_multi_tenant_rebuild.sql
```

3. Bekræft at tabeller findes:
   - `companies`
   - `users`
   - `roles`
   - `role_permissions`
   - `activity_logs`
   - `subscriptions`
4. Bekræft RLS er aktiv på alle tenant-tabeller.

---

## 2) Railway: environment variables

Sæt følgende i Railway service:

- `DATABASE_URL` (Supabase Postgres connection string)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_ISSUER` (`https://<project-ref>.supabase.co/auth/v1`)
- `GLOBAL_ADMIN_EMAILS` (kommasepareret liste)
- `PORT` (Railway sætter typisk selv)
- `PUBLIC_BASE_URL` (din Lovable frontend URL)

Backend læser alt fra `server/src/config/env.ts`.

---

## 3) Ny auth + tenant API (Railway)

### Public auth endpoints

- `POST /api/v1/auth/signup-owner`
- `POST /api/v1/auth/signup-member`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/google/exchange`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/validate-invite-code`

### Protected endpoints

- `GET /api/v1/auth/me`
- `GET /api/v1/company/settings`
- `PATCH /api/v1/company/settings`
- `POST /api/v1/company/invite-code/regenerate`
- `GET /api/v1/company/users`
- `PATCH /api/v1/company/users/:id/role`
- `GET /api/v1/company/activity-logs`
- `GET /api/v1/roles`
- `POST /api/v1/roles`

### Global admin endpoints

- `GET /api/v1/admin/companies`
- `PATCH /api/v1/admin/companies/:id/status`
- `GET /api/v1/admin/companies/:id/users`

Alle responses bruger standardformat:

```json
{ "ok": true, "data": { } }
```

eller

```json
{ "ok": false, "error": { "code": "...", "message": "..." } }
```

---

## 4) Lovable frontend integration

Lovable skal kun kalde Railway API.

Frontend env:

- `VITE_API_BASE_URL=https://<railway-domain>/api`
- `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<anon-key>`

Auth tokens (access + refresh) gemmes i frontend-session storage/local storage via API client.
Frontend bruger Supabase client **kun** til Google OAuth redirect/callback, og sender derefter session videre til Railway via `/api/v1/auth/google/exchange`.

---

## 5) Google OAuth opsætning (Supabase)

1. Gå til **Supabase Dashboard → Authentication → Providers → Google** og aktiver provider.
2. Indsæt Google OAuth Client ID + Secret.
3. Under **Authentication → URL Configuration** skal følgende være tilladt:
   - Site URL: dit frontend domæne (fx `https://app.example.com`)
   - Redirect URLs:
     - `http://localhost:5173/en/auth/callback`
     - `http://localhost:5173/da/auth/callback`
     - `https://<frontend-domain>/en/auth/callback`
     - `https://<frontend-domain>/da/auth/callback`
     - (tilføj evt. `de` eller andre locale paths)
4. I Google Cloud Console skal Authorized redirect URI pege på Supabase callback:
   - `https://<project-ref>.supabase.co/auth/v1/callback`

Resultat:
- Google-brugere bliver oprettet i **Supabase Auth** automatisk.
- Appen afslutter login/signup via `POST /api/v1/auth/google/exchange` og opretter manglende app-profil/company ved signup-flow.

## 6) Deploy

Fra repo root:

```bash
# backend
cd server
npm install
npm run build
```

Deploy Railway service med `server/` som root.

Frontend deployes separat (Lovable), med API base URL pegende på Railway backend.

---

## 6) Sikkerhedskrav dækket

- Supabase Auth som single source of truth
- JWT valideres i Railway backend (JWKS)
- Firma `is_active=false` blokerer adgang
- RBAC via `roles` + `role_permissions`
- RLS policies for tenant isolation
- `company_id` på tenant-data tabeller

