# AI Agency Danmark — Samlet Fundliste (Unified Findings)

**Oprettet:** 2026-10-27 (forberedelsesfasen, før lancering) · **Dom:** NO-GO
**Kilder sammenholdt:** kundetest 2026-10-26 (26 fund, dom IKKE KLAR, score 3/10) + `docs/product/OWNER_DEFECTS.md` (8 ejer-fund).
**Status pt.:** fix-forløbet er **ikke startet** på Batch 1. Ingen fund er RETTET (VERIFICERET).

> Format: `#nr [severitet] [kategori] sted: problem → konsekvens → forslag`
> Severiteter: KRITISK · HØJ · MIDDEL · LAV. Kilde markeres: **(KT)** = kundetest · **(OD)** = OWNER_DEFECTS.

---

## Antal pr. severitet

| Severitet | Antal | Numre |
|---|---|---|
| KRITISK | 4 | #001–#004 |
| HØJ | 15 | #005–#014, #027, #028, #029, #035, #036 |
| MIDDEL | 14 | #015–#026, #030, #031 |
| LAV | 4 | #032, #033, #034, #037 |
| **I alt** | **37** | |

---

## BATCH 1 (de 10 vigtigste — KRITISK først, fix-rækkefølge)

- **#001 [KRITISK] [Funktion] (KT)** Video Studio, "New video": tabellen `public.video_projects` findes ikke ("Could not find the table 'public.video_projects' in the schema cache") → intet projekt kan oprettes, rå fejl vises til kunden → migrationen `supabase/migrations/20261026000001_video_studio.sql` (findes kun på branch `video-studio/explore`) er aldrig kørt på prod-databasen; kør/verificér migrationen + skjul rå fejl bag en dansk fejlbesked.
- **#002 [KRITISK] [Datakvalitet] (KT)** Lead-generering: kun 2 af 10 kontrollerede leads var helt korrekte (forkerte byer og telefonnumre) → kunden betaler for ubrugelige leads → stop markedsføring af lead-kvalitet indtil kilde/validering er dokumenteret og stikprøve ≥ aftalt andel.
- **#003 [KRITISK] [Datakonsistens] (KT)** Pipeline = 12.500 kr. på CRM-dashboard, 62.500 kr. på Deals-siden → kunden kan ikke stole på nogen tal → find den ene sande kilde (SQL/RPC) og få begge visninger til at læse den.
- **#004 [KRITISK] [Datakonsistens] (KT)** "Cash collected" = 0 kr., mens tre betalinger i alt 52.500 kr. findes → økonomital er forkerte → ret aggregeringen; regressionstest mod `finance-edge`.
- **#005 [HØJ] [Onboarding] (KT)** `/app/onboarding` sender straks til dashboardet ("Færdiggør opsætningen" er en løkke) → ny kunde når aldrig første resultat → byg en reel onboarding-flow (<10 min til første resultat).
- **#006 [HØJ] [Indhold] (KT)** Testdata i kundevisninger ("TEST E2E Audit Deal", "QA Test Lead/Deal", selskab "Signup Bug Test ApS") → utroværdigt, og data ligger i **produktions-Supabase** (QA Tenant A/B kørte mod prod) → arkivér/slet efter ejerens godkendelse (sletning kræver tydeligt ja).
- **#007 [HØJ] [Tillid] (KT)** Lead-siden lover "verified emails", men alle er "Likely valid" 60–80 % → vildledende løfte → fjern/omformuler løftet, eller indfør ægte verifikation.
- **#008 [HØJ] [Datakvalitet] (KT)** Telefonnumre afkortede/forkerte (fx "323.3454545", "+45-69-89-69") → ubrugelige kontaktdata → normalisér og validér numre ved import.
- **#009 [HØJ] [Funktion] (KT)** Opgaver: "No tasks found", mens fire opgaver er aktive → kunden tror data er væk → ret forespørgsel/filter på opgavelisten.
- **#010 [HØJ] [Sikkerhed/Tillid] (KT)** UI viser rå JSON, interne hændelsesnavne ("email.received", "workflow_steps"), en Supabase-adresse og annoncekonto-id'er → lækker intern struktur, ser ustabilt ud → map til dansk, brugervendt tekst; aldrig rå interne id'er i UI.

---

## Øvrige kundetest-fund

- **#011 [HØJ] [Salg] (KT)** Ingen synlig supportkanal → kunden kan ikke få hjælp → tilføj support (e-mail/formular/chat) + oplyst svartid.
- **#012 [HØJ] [Salg] (KT)** Ingen synlig pris-/abonnementsside → kunden kan ikke købe/forstå pris → byg pris- og abonnementsside (Subscription-modul er NOT TESTED).
- **#013 [HØJ] [Integration] (KT)** Gmail-synk sidst opdateret 21. okt uden advarsel → kunden tror data er friske → vis "sidst synket" + advarsel ved forældelse.
- **#014 [HØJ] [GDPR/Jura] (KT)** Navngivne ansattes e-mails vises uden kilde/retsgrundlag → GDPR-risiko → **jurist** + vis kilde/retsgrundlag eller fjern.
- **#015 [MIDDEL] [Datamodel] (KT)** Samme person er både kunde og lead → dobbelt/forvirrende → dedupe på tværs af leads/customers.
- **#016 [MIDDEL] [Sprog] (KT)** Blandet dansk/engelsk, `lang`=engelsk, `/en/` i adressen, grammatik "1 deals" → uprofessionelt for dansk marked → dansk som standard-locale; pluralisering via `t()`.
- **#017 [MIDDEL] [Tegnkodning] (KT)** Autopilot viser "\xe5" i stedet for å → ødelagt tekst → ret encoding (UTF-8) i pipeline.
- **#018 [MIDDEL] [Tegnkodning] (KT)** HTML-entiteter vises som tekst i indbakkens forhåndsvisninger → ulæseligt → afkod entiteter i preview.
- **#019 [MIDDEL] [Tillid] (KT)** Modelnavnet "NVIDIA/NEMOTRON ... :FREE" synligt i Operating Manager → afslører intern modelkonfig (ligger i runtime-config/DB, ikke i koden) → skjul modelnavn i UI.
- **#020 [MIDDEL] [Datakvalitet] (KT)** "Company" indeholder sidetitler eller "Unknown" → skraldedata → ret skraberen/berigelsen.
- **#021 [MIDDEL] [Datakvalitet] (KT)** "Kontaktperson" tom for alle 21 leads → ufuldstændige leads → berig eller skjul feltet.
- **#022 [MIDDEL] [Datakvalitet] (KT)** To leads deler telefonnummer (308-1105721) → fejlberigelse → dedupe/validér.
- **#023 [MIDDEL] [Datakvalitet] (KT)** E-mails fra sidens forfatter-metadata bruges som kontakt → forkerte kontakter → ekskludér metadata-kilder.
- **#024 [MIDDEL] [Datakvalitet] (KT)** En byguide og en universitetsafdeling optræder som leads → ikke-virksomheder → filtrér ikke-B2B.
- **#025 [MIDDEL] [Datakvalitet] (KT)** Alle 21 leads har byen Aarhus, mindst 10 hører hjemme andetsteds → forkert geodata → ret by-udledning.
- **#026 [MIDDEL] [UX] (KT)** "Video (kræver GPU)" deaktiveret uden forklaring → kunden forstår det ikke → forklar eller skjul.

---

## Ejer-fund tilføjet fra OWNER_DEFECTS.md (#027+)

- **#027 [HØJ] [Billing/Sikkerhed] (OD, Issue 6)** `create_invitation` tjekker ikke pladstilgængelighed → ubegrænsede fakturerbare invitationer → indfør seat-tjek i backend + købsflow (kræver ejer-beslutninger om pris/proration/trial/refusion) — **deploy-blokeret, kræver godkendelse**.
- **#028 [HØJ] [Integration] (OD, Issue 2)** CVR-opslag: live blokeret (cvrapi.dk gratis-kvote opbrugt på delt edge-IP; kode-fejl allerede rettet) → opslag virker ikke i prod → **betalt cvrapi.dk-token (ejer)** + edge-deploy.
- **#029 [HØJ] [AI/Funktion] (OD, Issue 1)** Control Center naturligt-sprog-kommando kræver AI-model (BLOCKER-AI-001: provider 404) → primær oprettelsesvej virker ikke (approve/reject-vejen virker) → **AI-model-udbyder + endpoint/nøgle (ejer)**. Relateret til #019.
- **#030 [MIDDEL] [AI/Funktion] (OD, Issue 5)** AI Media billedgenerering: OpenRouter 402 "Credits opbrugt" (UI viser ærlig fejl) → funktion utilgængelig → **finansiér/udskift OpenRouter-nøgle (ejer)**.
- **#031 [MIDDEL] [Funktion] (OD, Issue 7)** Recruitment: ingen backend-tabel for ansøgerrejse (kun openings) → ufuldstændig funktion → ny migration + scope-beslutning — **deploy-blokeret**.
- **#032 [LAV] [Design] (OD, Issue 8)** Workforce-nav-rækkefølge i `WorkspaceRail.tsx` (item sidst i stedet for først) → mindre UX → 1-linjes flyt, koordineres.
- **#033 [LAV] [Design] (OD, Issue 3)** Calendar redesign (kun visuel polish; funktionelt VERIFIED) → ingen funktionel fejl → udskudt.
- **#034 [LAV] [Design] (OD, Issue 4)** Lead Gen visuel konsistens (kun design) → ingen funktionel fejl → udskudt.

---

## Fund opdaget under flette-planen (2026-10-27)

- **#035 [HØJ] [Migration/Drift] (release-branch)** To migrationer deler versionsnummer `20261026000001`: `20261026000001_video_studio.sql` (fra `video-studio/explore`) og `20261026000001_leadgen_owner_compliance.sql` (fra `feature/leadgen-chat`) → ved en produktionsmigration giver dubletten ikke-deterministisk rækkefølge eller "duplicate migration version"-fejl, og #001's tabel bliver måske ikke oprettet → omdøb den ene (anbefaling: leadgen-compliance → `20261026000002_…` så video_studio kører først), verificér på frisk schema før prod. **Deploy-blokerende; skal løses før migration-rækkefølgen fastlægges.** (Fletningen selv var ren — ingen tekstkonflikter; dette er en semantisk kollision.)

---

## Fund verificeret direkte i produktionen (skrivebeskyttet, 2026-10-27)

- **#036 [HØJ] [Sikkerhed] (prod-advisor)** 79 `SECURITY DEFINER`-funktioner er eksekverbare af `public` (anon) iflg. Supabase security-advisor — bl.a. `auto_mark_invoice_paid`, `auto_create_payment_on_invoice_paid`, `block_readonly_write` → en SECURITY DEFINER-funktion kører med forhøjede rettigheder; hvis en anon-kaldbar funktion mangler intern autorisation, kan den misbruges (fx markere faktura betalt, omgå tenant) → gennemgå de 79 anon-eksekverbare funktioner enkeltvis; `REVOKE EXECUTE FROM public/anon` på alt, der ikke bevidst skal være offentligt. **Kræver verifikation pr. funktion — nogle (fx `accept_invitation`) er designet offentlige.** Ingen ERROR-fund; RLS er slået til på alle ~125 tabeller.
- **#037 [LAV] [Sikkerhed] (prod-advisor)** "Leaked Password Protection" er slået fra i Supabase Auth → svage/kompromitterede adgangskoder tillades → slå HaveIBeenPwned-tjek til (Auth → Providers → Email). 2-minutters config.

> **Bekræftet rodårsag #001:** produktionens public-skema har **ingen `video_projects`-tabel**, og migrationen `20261026000001_video_studio` er **ikke** kørt (seneste kørte = `20261025000001_calendar_event_appearance`). Produktionen mangler begge 26/10-migrationer.
> **Datagrundlag i prod:** 13 virksomheder, 83 kunder, 36 fakturaer, 23 betalinger, 176 lead-resultater, 1056 samtykke-logs — ikke tom (jf. #006: testdata blandt rigtige rækker).

---

## BLOCKED-fund — hvad de venter på

| Fund | Venter på | Ejer/ekstern |
|---|---|---|
| #001 Video Studio | Kør `20261026000001_video_studio.sql` på DB + verificér (findes kun på `video-studio/explore`) | Ejer (migration-godkendelse) |
| #027 Seat-tjek | Prismodel-beslutninger + backend-deploy | Ejer |
| #028 CVR live | Betalt cvrapi.dk-token + edge-deploy | Ejer + cvrapi.dk |
| #029 Control Center NL / #019 | Produktions-AI-model (BLOCKER-AI-001) | Ejer + AI-udbyder |
| #030 AI Media | OpenRouter-kredit/ny nøgle | Ejer + OpenRouter |
| #031 Recruitment | Ny migration + scope | Ejer |
| Multi-bruger / HR-roller / onboarding E2E | Service-role-nøgle / bekræftede konti (BLOCKED-signup: Supabase "Confirm email" ON) | Ejer |

---

## Ikke dækket af kundetesten (skal ind i lanceringsplanen)

Landingsside · tilmelding/login · betaling/opsigelse · eksport/download · hele Video Studio-editoren (blokeret af #001) · AI-billedgenerering (#030) · Power Dialer · Voice Agent · masseudsendelse · Finans/HR-undersider · langsom forbindelse/offline · Safari/Firefox/mobil Safari · tastaturbrug · målt kontrast (WCAG AA) · ydeevne (Lighthouse).
