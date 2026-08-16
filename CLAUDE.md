# Crater CRM — Project Guide for AI Assistants

## What This App Is

Crater CRM is a multi-tenant B2B CRM platform for Danish agencies. It manages leads, deals,
employees, email campaigns, Meta Ads, and AI-powered workflows. Each company (tenant) gets
its own isolated workspace. The UI is fully translated in EN, DA, and DE.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| UI components | shadcn/ui (Radix UI primitives) |
| Styling | Tailwind CSS with CSS variables for theming |
| State / data | TanStack React Query v5 |
| Auth + OAuth | Supabase Auth (Google OAuth) |
| Primary API | Custom REST API at `https://api.aiagencydanmark.dk/api` |
| i18n | Custom `useI18n()` hook — translations in `src/messages/` |
| Routing | React Router DOM v6 with locale prefix (`/:locale/app/...`) |

---

## Directory Structure

```
src/
├── integrations/
│   └── supabase/
│       ├── client.ts      ← Supabase client (typed with Database)
│       └── types.ts       ← Database schema types (tables, functions, enums)
├── components/
│   ├── ui/                ← shadcn/ui primitives (never edit these directly)
│   ├── AppShell.tsx       ← Main layout wrapper (sidebar + topbar)
│   ├── TenantSidebar.tsx  ← Navigation sidebar
│   └── ...                ← Feature components
├── contexts/
│   ├── AuthContext.tsx    ← Auth state (user, login, logout)
│   └── TenantContext.tsx  ← Tenant settings (language, theme)
├── hooks/
│   └── api/               ← React Query hooks per feature domain
├── lib/
│   ├── api.ts             ← Primary API client (ApiClient class, all methods)
│   ├── supabase.ts        ← Re-exports from integrations/supabase/client
│   ├── i18n.tsx           ← Translation hook: useI18n() → t('key')
│   ├── tenant.ts          ← Tenant defaults persistence
│   └── crm/types.ts       ← CRM domain types (Lead, Deal, Task, etc.)
├── messages/
│   ├── en.json            ← English translations (source of truth)
│   ├── da.json            ← Danish translations
│   └── de.json            ← German translations
└── pages/
    ├── auth/              ← Login, RegisterCompany, JoinCompany, OAuthCallback
    ├── app/               ← All protected app pages
    │   ├── Dashboard.tsx
    │   ├── Onboarding.tsx
    │   ├── crm/           ← Leads, Deals
    │   ├── hr/            ← Employees
    │   ├── email/         ← EmailCampaigns
    │   ├── meta/          ← MetaAds
    │   ├── tasks/         ← Tasks
    │   ├── settings/      ← CompanySettings
    │   ├── admin/         ← AdminOverview (global_admin only)
    │   ├── Workflows.tsx
    │   ├── Integrations.tsx
    │   ├── ClowdBot.tsx
    │   └── History.tsx
    └── NotFound.tsx
```

---

## Backend Architecture

### Primary API (`src/lib/api.ts`)

All feature data (leads, deals, tasks, campaigns, employees, etc.) goes through
`src/lib/api.ts` — a typed `ApiClient` class that talks to the Railway backend.

```ts
import { api } from '@/lib/api';

// Usage examples:
await api.listLeads({ status: 'new', q: 'search term' });
await api.createLead({ name, phone, email, company_name });
await api.updateLead(id, { status: 'contacted', notes });
```

The client handles:
- JWT token storage and refresh (via `localStorage`)
- Tenant ID injection via request headers
- All auth flows (email/password, Google OAuth exchange)

### Supabase (`src/integrations/supabase/client.ts`)

Supabase is used **only** for:
- Google OAuth initiation (`supabase.auth.signInWithOAuth`)
- Session token exchange (OAuthCallback page)

Supabase DB tables exist for `companies`, `profiles`, `leads`, `invitations`, `user_roles`
but are accessed primarily through the Railway API, not directly from the frontend.

---

## Authentication Flow

1. **Email/password** → `api.login()` → JWT stored in localStorage
2. **Google OAuth** → `supabase.auth.signInWithOAuth()` → redirects to `/auth/callback`
   → `api.exchangeGoogleSession()` → JWT stored
3. **Session restore** → `api.getToken()` + `api.getMe()` on app load
4. **Logout** → `api.logout()` + clear localStorage

Auth state lives in `AuthContext`. Use `useAuth()` to access `user`, `isAuthenticated`.

---

## Adding a New Page

1. Create `src/pages/app/feature/MyPage.tsx`
2. Add route in `src/App.tsx` under the protected routes section
3. Add nav item in `src/components/TenantSidebar.tsx`
4. Add translations in `src/messages/en.json`, `da.json`, `de.json`
5. Use `api.*` methods for data, wrapped in React Query if needed

### Page template

```tsx
import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/use-toast';

export default function MyFeaturePage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.myMethod()
      .then(res => setData(res.data))
      .catch(err => toast({ title: err.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [toast]);

  return <div className="space-y-6">...</div>;
}
```

---

## i18n — Translations

All user-visible strings must use the translation hook. **Never hardcode UI strings.**

```ts
const { t } = useI18n();
// Usage: t('section.key')
```

When adding a new string:
1. Add to `src/messages/en.json` (English, source of truth)
2. Add matching key to `src/messages/da.json` (Danish)
3. Add matching key to `src/messages/de.json` (German)

---

## Styling Rules

- Use **Tailwind CSS utility classes** only
- Use **CSS variables** for colors (e.g. `text-foreground`, `bg-card`, `border-border`)
  — never hardcode hex colors
- Dark mode is class-based via `next-themes`
- Use shadcn/ui components from `@/components/ui/` for all UI primitives
- Spacing: use `space-y-6` for page sections, `gap-3` for inline elements

---

## Environment Variables

```env
VITE_SUPABASE_URL=              # Supabase project URL
VITE_SUPABASE_PUBLISHABLE_KEY=  # Supabase anon/public key
VITE_API_BASE_URL=              # Optional: override Railway API base (default: production)
```

---

## Multi-tenant

Every authenticated user belongs to a `company_id`. The API client automatically injects
the tenant ID in request headers. Never filter by company_id on the frontend — the backend
handles tenant isolation.

User roles: `employee`, `manager`, `admin`, `global_admin` (system-wide superuser).
Check `user.is_global_admin` to show admin-only UI.

---

## Scripts

```bash
npm run dev          # Start dev server on :8080
npm run build        # Production build
npm run type-check   # TypeScript check (no emit)
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run check        # type-check + lint combined
npm test             # Run Vitest tests
```

Pre-commit hooks (Husky) run lint-staged automatically on every commit.
CI runs type-check → lint → build on every push.
