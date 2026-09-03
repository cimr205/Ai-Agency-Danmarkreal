# Production Architecture — Source of Truth

Investigated 2026-09-03. This document is authoritative — trust it over
`supabase/config.toml`, which contains a stale project reference (see below).

## Verified facts

| Field | Value | Evidence |
|---|---|---|
| **PRODUCTION_REPOSITORY** | `git@github.com:cimr205/Ai-Agency-Danmarkreal.git` | `git remote -v` |
| **PRODUCTION_BRANCH** | `main` is Vercel's git-integration branch (`origin/HEAD -> origin/main`), but see **divergence warning** below | `git branch -a` |
| **PRODUCTION_FRONTEND** | Vercel project `crater-crm-launch-3c1f0b96-main`, domain `https://www.aiagencydanmark.dk` | `vercel project ls`, `vercel domains ls` |
| **PRODUCTION_SUPABASE** | `vbxlpxhvojlaisxcipyh` ("crater-crm", eu-central-1, ACTIVE_HEALTHY) | See verification chain below |
| **STAGING_SUPABASE** | None exists. No separate staging project is configured anywhere in this repo or Vercel env. | — |

## Verification chain for PRODUCTION_SUPABASE

1. Repo's `.env` (what the local build uses): `VITE_SUPABASE_URL=https://vbxlpxhvojlaisxcipyh.supabase.co`.
2. Vercel production environment has `VITE_SUPABASE_URL`/`VITE_SUPABASE_PROJECT_ID`/`VITE_SUPABASE_PUBLISHABLE_KEY` configured for the `Production` environment (values hidden by Vercel, but present and dated 17 days ago — predates this session, so not something this session set).
3. `supabase projects list` (this account) shows exactly 3 projects: `vbxlpxhvojlaisxcipyh` ("crater-crm", **linked: true**), `abqfhcahdcjnkzuvbunl` ("aiagencydanmark@gmail.com's Project", unlinked), `aioicjfwuyyhsxyakpui` ("crm-platform", **status: INACTIVE**, unlinked).
4. **`inyrwsygghdjhmqejgwk` (the Lovable/bridge-orbit-core project named in the audit) does not appear in this Supabase account's project list at all.** It is not accessible from here — either it belongs to a different account/org, or no longer exists under this account.
5. Every edge function deploy, migration, and live data query performed across this entire session (companies, leads, deals, invoices, the AI engine's live testing, etc.) went against `vbxlpxhvojlaisxcipyh` and returned real, live, consistent data.

**Conclusion: `vbxlpxhvojlaisxcipyh` is production.** `inyrwsygghdjhmqejgwk` is a stale reference from an earlier project stage (consistent with prior session notes: this repo originally shipped as a Lovable export describing a different backend, and was migrated to `vbxlpxhvojlaisxcipyh` as the real source of truth before this session began).

## `supabase/config.toml` mismatch — explained, not a real risk

`supabase/config.toml` still declares `project_id = "inyrwsygghdjhmqejgwk"`. This is dead config — the Supabase CLI's actual link target for this working copy is `supabase/.temp/project-ref` (gitignored, machine-local), which correctly resolves to `vbxlpxhvojlaisxcipyh` and is what every `supabase functions deploy` / `supabase db query` command in this session actually targeted, confirmed via each command's own `"project_ref":"vbxlpxhvojlaisxcipyh"` response. **Action item:** update `config.toml`'s `project_id` to `vbxlpxhvojlaisxcipyh` so a fresh clone doesn't silently link to the wrong (and inaccessible) project. Low risk, high confusion-prevention value — done as part of this remediation pass.

## Branch divergence warning (real finding, not resolved by this doc)

Vercel's git integration is configured against `main`, but every deploy this session (and, per commit history, likely prior sessions) shipped via direct `vercel --prod --yes` CLI invocation from whatever branch's working tree was checked out locally (`claude/ai-operating-manager-model` for this session, `claude/backend-production` before it) — **not** via merging to `main` and letting CI/CD deploy automatically. This means:

- The live production frontend at `www.aiagencydanmark.dk` reflects the last `vercel --prod` push, not necessarily the tip of `main`.
- `main` branch in git is very likely **behind** what's actually live.
- If someone pushes to `main` and Vercel's git integration triggers an auto-deploy, it could **overwrite** the current live state with older code, since `main` hasn't been receiving these direct-deploy commits.

**Action item (not yet done — needs a decision from the user):** either (a) merge the working branch into `main` so git and live state agree, or (b) disconnect Vercel's git auto-deploy and formally adopt "deploy via CLI from the reviewed branch" as the real workflow. Flagging this rather than silently picking one.

## Irreversible database changes

No blocker found — repository and live production Supabase are confirmed to match. Proceeding with Phase 1 onward.
