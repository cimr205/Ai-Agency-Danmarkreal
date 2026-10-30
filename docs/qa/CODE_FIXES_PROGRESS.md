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
- ⬜ #19 roller: én central rolle-funktion med fast rækkefølge
- ⬜ #89 løn: afgrænset v1 med justérbare satser, tydeligt mærket estimat

## Batch C — de 34 "rettet i kode, ikke bevist" (gen-tjek + ret hvor faktisk forkert)
(fyldes ud under gennemgang)

## Batch D — de 55 verificerede (kun regressions-gen-tjek til sidst)

## Gates
- type-check / lint / build / vitest: (køres efter hver batch)
