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
| Auth + OAuth | Supabase Auth (email/password + Google OAuth) |
| Primary API | Supabase directly — Postgres + RLS, ~60 Deno edge functions in `supabase/functions/*` |
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

### Supabase (`src/integrations/supabase/client.ts`)

There is no separate backend API — the frontend talks to Supabase directly:
- **Postgres + RLS**: tables are queried directly via `supabase.from(...)`, scoped per
  tenant by Row Level Security (never filter by `company_id` manually on the frontend —
  RLS does it, driven by `get_user_company_id(auth.uid())`).
- **RPCs**: business logic that must run atomically/with elevated checks lives in
  Postgres functions, called via `supabase.rpc('fn_name', { ... })`.
- **Edge functions**: ~60 Deno functions in `supabase/functions/*` (lead-gen, email,
  Meta/Gmail/Twilio integrations, AI-assisted actions, etc.), called via
  `supabase.functions.invoke('function-name', { body })`.
- **Auth**: Supabase Auth handles both email/password and Google OAuth.

A `CLAUDE.md` note from an earlier iteration described a separate Railway REST API
(`src/lib/api.ts`, `https://api.aiagencydanmark.dk/api`) as the primary backend. That
file no longer exists in this codebase — it was fully replaced by the Supabase-direct
pattern above. All new work should follow that pattern, not the Railway one.

---

## Authentication Flow

1. **Email/password** → `supabase.auth.signInWithPassword()` → session stored by the
   Supabase client (localStorage)
2. **Google OAuth** → `supabase.auth.signInWithOAuth()` → redirects to `/auth/callback`
   → session established directly by Supabase on return
3. **Session restore** → `supabase.auth.getSession()` on app load
4. **Logout** → `supabase.auth.signOut()`

Auth state lives in `AuthContext`. Use `useAuth()` to access `user`, `isAuthenticated`.

---

## Adding a New Page

1. Create `src/pages/app/feature/MyPage.tsx`
2. Add route in `src/App.tsx` under the protected routes section
3. Add nav item in `src/components/TenantSidebar.tsx`
4. Add translations in `src/messages/en.json`, `da.json`, `de.json`
5. Add a React Query hook in `src/hooks/api/` that queries Supabase directly
   (`supabase.from(...)` / `supabase.rpc(...)` / `supabase.functions.invoke(...)`) —
   never a new `api.*` call, that client doesn't exist anymore

### Hook + page pattern

```ts
// src/hooks/api/useMyFeature.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useMyFeature() {
  return useQuery({
    queryKey: ['my-feature'],
    queryFn: async () => {
      const { data, error } = await supabase.from('my_table').select('*');
      if (error) throw error;
      return data;
    },
  });
}
```

```tsx
// src/pages/app/feature/MyPage.tsx
import { useI18n } from '@/lib/i18n';
import { useMyFeature } from '@/hooks/api/useMyFeature';

export default function MyFeaturePage() {
  const { t } = useI18n();
  const { data, isLoading, error } = useMyFeature();

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
VITE_SUPABASE_URL=              # Supabase project URL — the only backend; point this at
                                 # staging for local dev against non-production data
VITE_SUPABASE_PUBLISHABLE_KEY=  # Supabase anon/public key
```

---

## Multi-tenant

Every authenticated user has a `profiles` row with a `company_id`. Tenant isolation is
enforced by Postgres RLS policies (keyed off `get_user_company_id(auth.uid())`), not by
the frontend — never add a manual `company_id` filter as a security measure, RLS already
scopes every query.

User roles (`public.app_role` enum, in `user_roles`): `owner`, `company_admin`, `manager`,
`employee`, `readonly`, `partner`, `system_admin` (system-wide superuser).

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
