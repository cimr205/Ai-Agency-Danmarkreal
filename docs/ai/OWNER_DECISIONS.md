# Owner Decisions (questions that must not block independent work)

| # | Question | Why it matters | Blocks | Raised |
|---|---|---|---|---|
| 1 | Which OpenAI-compatible model endpoint and credentials may be used for a real inference test (`LOCAL_LLM_BASE_URL`, `LOCAL_LLM_MODEL`, `LOCAL_LLM_API_KEY`)? Is there a genuinely free tier you want used? | Without it, live inference stays BLOCKED and only the mock is verified. | Live-inference PASS only | 2026-10-18 |
| 2 | May `@ai-sdk/openai-compatible` be added to the Mastra branch? | Needed to build a live model from the existing env contract. | Live-inference wiring | 2026-10-18 |
| 3 | When and how should the `chore/mastra-install` dependency changes be merged into `feature/frontend-operating-system`, given the other agent's uncommitted `package.json`/lockfile edits? | Avoids clobbering their lockfile. | Integration only | 2026-10-18 |
| 4 | Is a persistent Mastra storage adapter (`@mastra/pg` against Supabase, or `@mastra/libsql`) approved? | Memory beyond in-process needs it. | Persistent memory only | 2026-10-18 |
| 5 | Is the loop scheduler (`CronCreate`) expected to be available? | Now scheduled (job 07d9a887, every 30 min). | — resolved | 2026-10-18 |
| 6 | The strict `npm run type-check` fails on 3 pre-existing errors in `AdminEmployees.tsx`, `AdminUsers.tsx`, `InvitationsPage.tsx` — code references `invitations.token` but the generated Supabase types only have `token_hash`. Who owns fixing this (regenerate types / rename column / fix code)? | Blocks a green CI type-check for the whole branch; `npm run build` is unaffected. Not touched (other agent's files). | CI type-check only (not build, not Mastra) | 2026-10-18 |
