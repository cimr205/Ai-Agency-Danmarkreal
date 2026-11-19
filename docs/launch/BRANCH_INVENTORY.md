# Branch Inventory — 2026-11-10

Re-verified (not assumed from the 2026-11-07 audit) via `git branch --merged origin/main` and ancestry checks.

## MERGED — safe to delete locally, no unique work at risk

Confirmed via `git branch --merged origin/main` just now:

| Branch | Note |
|---|---|
| `chore/mastra-install` | Fully merged |
| `claude/qa-round20-2026-10-30` | Identical to `origin/main` at the time; fully merged |
| `feat/linkedin-outreach` | Fully merged |
| `feature/frontend-operating-system` | Fully merged |
| `feature/phase-3-production-hardening` | Fully merged |
| `fix/migration-reproducibility` | Fully merged |
| `fix/section-dashboards-dark-mode` | Fully merged |
| `merge/publish-all` | Fully merged (was the merge-prep for `feature/frontend-operating-system`) |
| `merge/publish-frontend` | Fully merged (same as above) |
| `video-studio/explore` | Fully merged |

`worktree-agent-a0fde73a615d6ff06`, `-a17c9e5278dc708b9`, `-a46fb731a2c686bb2`, `-af4b7915bf7f68228` — re-confirmed ancestors of `feature/leadgen-chat` (sequential checkpoints, not competing forks, already folded in). Safe to delete as branch references once `feature/leadgen-chat` itself is merged or retired.

**Not deleted in this pass** — deletion of local branch refs was judged lower-priority than the remaining P0/P1 verification work, and the masterprompt requires confirming "no unique changes risk being lost" before deleting, which the above confirms, but execution was deferred to keep this session's remaining time on verification rather than cleanup. Recommend: `git branch -d` the 10 branches above once reviewed.

## ACTIVE — real, divergent work

| Branch | Status |
|---|---|
| `feature/dialer-calendar-design-and-errors` | **The actual active line of development.** 8 new onboarding/billing-security commits since 2026-11-08 (verified, see `docs/launch/...` and `docs/ai/UNCOMMITTED_WORK_PROTECTION.md`), plus `fix/trial-3-days`-equivalent and `fix/employee-id-collision`-equivalent changes already landed. Still has uncommitted work (backed up, see below). |
| `fix/trial-3-days`, `fix/employee-id-collision` | Both merged into `integration/combined-2026-11-08` this session (see `docs/ai/INTEGRATION_REPORT_2026-11-08.md` follow-up commits on that branch). Safe to delete on origin once that combined branch (or the equivalent already-landed work on the active branch) is confirmed as the single source of truth — **not done in this pass**, since the active branch and the combined-integration branch are themselves still divergent (see below). |
| `integration/combined-2026-11-08`, `integration/launch-blockers-2026-11-08`, `integration/qa114-code-2026-11-08`, `integration/ai-fallback-2026-11-08` | This session's and the 2026-11-08 session's integration branches, built from `origin/main`. **These have NOT been reconciled with `feature/dialer-calendar-design-and-errors`'s independent 8-commit onboarding/billing series** — the two lines solved overlapping problems (trial-overwrite, billing security) independently. See "Open risk" below. |

## REQUIRES_REVIEW — superseded or needs a diff before any decision

| Branch | Status |
|---|---|
| `feat/ai-free-model-fallback` | Confirmed obsolete in the 2026-11-08 pass — `origin/main` already has a better version (with the `MAX_MODELS=3` cap this branch lacked). Recommend delete. |
| `feature/crm-agents` | Found this pass to be a divergent line that arrived at overlapping functionality with what's already on the active branch (idempotency-tested CRM agents). **Not diffed in detail** — see `docs/launch/AI_AGENT_VERIFICATION.md`. Needs a dedicated diff pass before deleting. |
| `feature/finance-ops-agents`, `feature/hr-qa-agents`, `feature/marketing-agents`, `feature/social-suite`, `feature/leadgen-chat`, `release/launch-integration` | Not re-examined in this pass (2026-11-07 audit findings stand: each has its own documented blockers — HR has the honest QA-1 live-test gap now partially closed by this session's live RLS policy review; the others' status is unchanged). |

## PARKED

| Branch | Reason |
|---|---|
| `feature/section-dashboards` | 80 commits behind `origin/main`; contains one real unique component (`AgendaPanel.tsx`) not worth a full rebase for, per the 2026-11-07 audit. Unchanged this pass. |

## Open risk flagged by this pass (new finding, not previously documented)

**The active branch (`feature/dialer-calendar-design-and-errors`) and this session's `origin/main`-based integration branches are two independently-evolved lines that both addressed billing/trial security.** The active branch's own 8-commit series (2026-11-08, "Onboarding 1/7..7/7") already closed the trial-overwrite and billing-authorization gaps independently of — and more thoroughly than — the `claude/launch-blockers-2026-10-31`/`fix/qa-114-code` work integrated into `integration/combined-2026-11-08`. **These two lines have not been reconciled.** Before either is merged to `main`, a dedicated reconciliation pass should confirm which line's billing-security implementation is canonical (the active branch's `stripe-subscription-webhook` + `accept_invitation` seat-limit work looks more complete and more recently reviewed — see `docs/launch/STRIPE_VERIFICATION.md`), and retire the other rather than merging both and risking two different trial/billing logic paths colliding.

## Update 2026-11-11: branch divergence is real but production is NOT currently at risk from it

This branch (`feature/dialer-calendar-design-and-errors`) is 43 commits behind `origin/main` and 28 ahead — a real, unreconciled divergence (includes `main`'s AI-model-fallback `MAX_MODELS` cap and ~20 QA-round fix batches this branch's git history doesn't have).

**Checked directly against the live project** (not inferred from git) whether the two most security-relevant missing commits' fixes are actually live:
- `c94e13c` (webhook SSRF protection, smart-assistant crash fix, OAuth open-redirect fix): **both checked live functions (`webhook-dispatch`, `smart-assistant`) already have these fixes deployed.** Production was patched independently of this branch's git history, likely from a prior deploy session built off `main` or a different branch.
- `2f014ca` (cross-tenant HR data leak in dashboard — system_admin saw other tenants' employees): the underlying migration `20261028000003_dashboard_scope_to_own_company` **is applied** to the live database (confirmed via `list_migrations`).

**Conclusion:** production is not currently exposed by this branch's git divergence from `main` — the live database and several live edge functions already carry fixes this branch's commit history doesn't show, because deploys have come from multiple sessions/branches over time, not strictly from this branch. **This does not mean the divergence is safe to ignore** — the next person who deploys from this branch's current `supabase/functions/` tree without checking live state first could silently roll back `webhook-dispatch` or `smart-assistant` to a pre-fix version, the same way yesterday's deploy (commit `66a952c`) would have rolled back `create-checkout` if this session hadn't caught it. **Recommendation: before any future bulk edge-function deploy from this branch, diff the local file against the currently deployed one (`mcp__supabase__get_edge_function`) rather than assuming the branch is the source of truth.**
