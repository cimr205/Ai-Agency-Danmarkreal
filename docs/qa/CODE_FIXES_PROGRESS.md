# Kode-fix forløb — alle 114 fejl (kode-delen)

Branch: `fix/qa-114-code` (worktree, baseret på `claude/qa-round18-2026-10-29` @ 4c2ff08).
Beslutning (2026-10-30): **kode nu, prod venter.** De 19 produktions-udrulninger (8 migrationer + 11 edge functions) holdes tilbage til ejeren bekræfter PITR/backup. Intet pushes/deployes uden eksplicit ja.

Legende: ⬜ ikke startet · 🟡 i gang · ✅ rettet i kode · ⏸ venter på prod/ejer · ☑️ allerede verificeret (kun gen-tjek)

## Batch A — reelt i stykker selv i "rettet" kode (FEJLFORKLARING afsnit 2)
- ✅ #6  economic-sync: faktura-flow fallback fjernet (fejler nu loud hvis intet ledigt nr.)
- ✅ #2  webhook SSRF: DNS-opslag før hvert fetch; private IP'er afvises (isPrivateIp + assertPublicDnsOrThrow)
- ✅ #18 companies INSERT: én selvbetjent virksomhed pr. bruger (migration 20261030000001) ⏸ prod
- ✅ #82 åben arbejdsdag: server-side auto-luk (migration 20261030000002) + MAX_SHIFT_HOURS-loft i UI (useWorkforce/WorkforceDashboard/TimeTracking) ⏸ migration venter prod
- ✅ #15 aktiveringskode: REVOKE kolonne-SELECT + get_company_activation_code-RPC (migration 20261030000003) + frontend narrowing ⏸ prod
- ✅ #96 ai-generate: dansk hardcode fjernet; 402→503 (bebrejder ikke kunden) + alert-log
- ✅ #130 CVR (kode): label+aria allerede t3/aria på branchen; rettet resterende dansk toast ("Fandt:")

## Batch B — beslutninger (kode-del, §4)
- ✅ #19 roller: `primaryRole` i AuthContext (fast rækkefølge) + DB-funktion get_user_primary_role (migration 20261030000004) ⏸ prod
- ✅ #89 løn: gross→net estimat med justérbare danske satser (AM 8%, A-skat, ATP, pension, feriepenge) + tydeligt "estimat"; gemmer base/deductions/net. Timeløn-fra-timeseddel kræver hourly_rate-felt (follow-up, skema)

### Resterende åbne (ejer / opsætning)
- ⏸ #76 testdata-oprydning: først #112 (migration present), derefter data-oprydning ⏸ prod/ejer
- ⏸ #96 credits-top-up: ejer fylder OpenRouter-konto
- ⏸ #130 CVR betalt nøgle: ejer skaffer nøgle
- ⏸ #127 Gmail OAuth → produktion: ejer i Google Cloud Console

## Batch C — de 34 "rettet i kode, ikke bevist"
Disse er allerede kodet på qa-round18-branchen. Statisk gen-tjek:
- ☑️ #28 ingen rester af `useLeadsPaginated`/`public.leads` i frontend
- ☑️ #121 deploy-workflow bruger prod-ref `vbxlpxhvojlaisxcipyh` (config.toml's `inyrw` er lokalt stack-navn, overrides af `--project-ref` i CI)
- Resten kræver kørende app mod prod/staging for ægte bevis (porten holdt) → står på ejer-listen.

## Batch D — de 55 verificerede: regressions-dækket af gate-suiten (se nedenfor).

## Gates (2026-10-30, branch fix/qa-114-code)
- type-check: ✅ 0 fejl
- lint: ✅ 0 errors (2 præeksisterende warnings i AuthContext)
- build: ✅ built in ~1m
- vitest: ✅ 360 passed, 7 skipped, 0 failed (kræver VITE_SUPABASE_URL/_PUBLISHABLE_KEY i env — ellers fejler 3 filer på "supabaseUrl is required", et kendt CI-env-krav, ikke en kodefejl)

## Overdragelse — kræver ejer / prod (porten holdt)
1. Afprøvet PITR/backup på prod `vbxlpxhvojlaisxcipyh` → DEREFTER kør de 5 nye + eksisterende migrationer og deploy de 11 edge functions.
2. #96 fyld credits på OpenRouter-kontoen. 3. #130 betalt CVR-nøgle. 4. #127 Gmail OAuth → produktion i Google Cloud Console. 5. GitHub-secrets SUPABASE_ACCESS_TOKEN/SUPABASE_DB_PASSWORD for auto-deploy.
