# QA round 20 — rapport og 100 forbedringer

Dato: 30.–31. oktober 2026. Testet på produktion (`www.aiagencydanmark.dk`) i den indbyggede browser.
Meta Ads er ikke testet efter aftale.

## 1. Fejl fundet

Status: `fixed` = rettet og på main, `fixed-deploy-fn` = rettet i koden, men kræver `supabase functions deploy`,
`config` = kræver opsætning, `decision` = kræver din beslutning.

| Id | Alvor | Område | Fejl | Sådan genskabes den | Status |
|---|---|---|---|---|---|
| R20-01 | Critical | AI | Alle AI-kald, der bruger fallback-listen, fejler med `'models' array must have 3 items or fewer`. Bekræftet på Summarize relationship, Deal Coach og workflow-assistant. | Lead → Summarize relationship | fixed-deploy-fn |
| R20-02 | Critical | Betaling | `check-subscription` skrev status `none` ved et almindeligt besøg på abonnementssiden og låste hele virksomheden. | Stripe-kunde uden abonnement åbner `/app/subscription` | fixed-deploy-fn. "smile verden aps" er låst op med trial 2099 |
| R20-03 | High | Produktion | Edge functions i produktion var udrullet fra en branch, der ikke var på main. | Sammenlign `feat/ai-free-model-fallback` med main | fixed (branchen er flettet ind) |
| R20-04 | High | Login | Bruger blev logget ud efter 25 min, selv med "Bliv logget ind", og aktivitet i én fane holdt ikke de andre i live. | Lad én fane stå i 25 min | fixed |
| R20-05 | High | Datoer | Efter midnat brugte klienten UTC-datoen: forfaldsdato blev 13/11 i stedet for 14/11. | Åbn ny faktura kl. 00–02 | fixed (klient). Dashboard-grafen er ikke rettet, se forbedring 12 |
| R20-06 | Med | Tal | Minus blev fjernet stille i beløbsfelter, så `-5000` kunne blive til `5000`. | Skriv `-5000` i dealens værdi | fixed |
| R20-07 | Med | Sprog | 15 manglende nøgler gav engelsk tekst på /da og /de (Rediger, Afdeling, Krav m.fl.). | Åbn /da/app/hr/recruitment | fixed |
| R20-08 | Med | Sprog | Danske toasts på /en og /de (Opdateret, Slettet, Fortryd, Forbindelse afbrudt m.fl.). | Opdatér en opgave på /en | fixed |
| R20-09 | Med | Sprog | Tekster låst til sproget ved første indlæsning (15 konstanter). Sprogskift gav blandet sprog. | Skift sprog i appen uden genindlæsning | fixed |
| R20-10 | Med | UX | Rå koder og `null` på Autopilot og Control Room (`lead.status_changed`, rå JSON). | Åbn /app/autopilot | fixed |
| R20-11 | Med | UX | Tilbudsknapper viste status i stedet for handling ("Sent", "Rejected"). | Tilbud i kladde | fixed |
| R20-12 | Low | UX | Toast efter betaling sagde "Mark as paid". Tidslinjen viste "Tilbud:" og "Betaling modtaget" på /en. Rollenavn vist rå i Invitations. | Markér faktura betalt | fixed |
| R20-13 | Low | Ydelse | Hashede filer i `/assets` havde `max-age=0`, så browseren skulle tjekke dem ved hvert besøg. | `curl -I` på en asset | fixed |
| R20-14 | Low | E-mail | Startskabeloner valgte sprog med en nøgle, der ikke fandtes. | Opret startskabeloner på /da | fixed |
| R20-15 | Config | CVR | Gratis CVR-kvote er brugt, så opslag giver 502. | Tilføj kunde → CVR-opslag | config: kræver betalt CVRAPI-nøgle |
| R20-16 | Decision | Betaling | Betalingsmuren ser kun på status. Virksomheder med udløbet prøveperiode kan stadig have adgang. | Se forbedring 3 | decision |
| R20-17 | Low | Produktion | 3 deployede functions findes ikke i repoet: `stripe-webhook`, `meta-leadgen-webhook`, `create-invoice-checkout-session`. | Sammenlign deployede functions med `supabase/functions` | decision |
| R20-18 | Med | Skrifttyper | CSP blokerer `onload` på skrifttypen i `index.html`, så Inter sandsynligvis ikke indlæses. PR #4 (åben siden oktober) handler om samme fejl. | Læs konsollen på en vilkårlig side | decision: gennemgå PR #4 |

**Verificeret i produktion (`index-D9bwrKUW.js`):** R20-07 (stillingsdialog på dansk), R20-05 (forfaldsdato 14/11 kl. 01:01), R20-10 (ingen rå koder eller `null`), R20-12 (tidslinje på /en), R20-13 (cache-header). 
**Ikke verificeret i produktion:** R20-04, R20-06, R20-08, R20-09, R20-11 og R20-14 er kun kode-, type- og CI-tjekket.

## 2. Testet og godkendt

- 65 tabeller og 36 RPC'er findes. `email_accounts.access_token` er spærret. `ai-health` svarer online.
- 146 sidebesøg uden sidenedbrud: 50 på /en, 48 på /da og 48 på /de.
- Klik-gennemgang: 48 sider, 18 dialoger, faner på 15 sider. Ingen konsolfejl.
- 6 administratorsider åbner uden fejl. Ingen vandret scroll på 15 sider ved 375 px.
- Flow: lead → deal (rigtig kunde) → værdi og dato → Won → tilbud → Accepted → faktura → betalt → Payments og Dashboard stemmer.
- Validering godkendt: dublet-e-mail, telefon `abc!!`, CVR `123`, faktura `-10`, tom fakturalinje, 99,99 → moms 25,00 og total 124,99,
  manglende CVR-advarsel, forfaldsdato udfyldt, Q-2026-001, moms 250 → 100, tilbud uden lead, webhook til localhost,
  negativ løn, fravær med slutdato før startdato, ICP min. > maks., Mark as Lost med Cancel, DKK → EUR ændrer ikke fakturaer,
  automatiske opgaver har mærket "Automatic".

## 3. Ikke testet

- **AI-funktioner:** Summarize, Deal Coach og Workflow Studio-kørsel fejler, indtil R20-01 er udrullet.
- **Gmail-synk:** Gmail er ikke forbundet i test-sessionen.
- **Dobbelt løn samme måned og gem af medarbejderdetaljer:** Kræver ændring af din rigtige medarbejder.
- **Negativ værdi i New Deal:** Ikke testet separat.
- **Opgaver med forfald i dag:** Farven blev ikke målt, fordi automatiske opgaver ikke viser dato på listen.
- **Udgående og permanente handlinger:** Send, ring, godkend, download, betal og slet er ikke klikket.
- **Mørkt tema og screenshot af hver dialog:** Ikke gennemført.

## 4. Testdata i produktion

Oprettet med navnet QA-TEST eller knyttet til det, og ikke slettet: lead/kunde `QA-TEST Lead R20`, en vundet deal på 12.500 kr., tilbud `Q-2026-001`,
faktura `2026-0002`, en betaling på 12.500 kr., `QA-TEST ICP R20` samt automatisk oprettede opgaver.
**Betalingen tæller med i Cash collected på dashboardet, indtil den er fjernet.**
ICP-scoringen skrev også en score for din rigtige lead CIMRAAN.
Slet kun med dit "ja, slet".

## 5. 100 forbedringer

Prioritet: 🔴 gør først, 🟠 gør snart, 🟢 når der er tid. Alle er forslag og ikke lavet, medmindre det står der.

### Drift og pålitelighed
1. 🔴 Udrul edge functions fra main, så AI virker igen (R20-01 og R20-02).
2. 🔴 Giv "Deploy Supabase"-workflowet sine secrets, så det ikke springes over på 8 sekunder.
3. 🔴 Beslut om betalingsmuren skal håndhæve udløbet prøveperiode, og giv berørte virksomheder varsel først.
4. 🔴 Lad kun main-workflowet udrulle til produktion, så produktion ikke kan afvige fra main igen.
5. 🔴 Lad `ai-health` lave et rigtigt testkald, for den svarede online, mens AI-kald fejlede.
6. 🔴 Giv besked til administrator, når AI-kald fejler, ikke kun i loggen.
7. 🟠 Tag stilling til de 3 functions, der ikke findes i repoet.
8. 🟠 Log ændringer af `subscription_status` med gammel og ny værdi. I denne runde kunne den gamle værdi ikke findes.
9. 🟠 Tilføj admin-knap til at sætte prøveperiode og status, så det ikke kræver SQL.
10. 🟠 Vis version og udrulningstidspunkt for frontend og functions på Monitoring-siden.
11. 🟠 Gør GET-kald uden skrivninger til reglen: en side, der viser data, må ikke ændre dem.
12. 🟠 Beregn dashboardets dage og måneder i dansk tid. Grafen viste en betaling den 31. okt. som 30. okt.
13. 🟠 Tjek om abonnementsstatus kan afvige fra Stripe, og synk via webhook frem for sidebesøg.
14. 🟠 Vis en tydelig besked på betalingssiden, når man sendes dertil, med årsagen.
15. 🟢 Genindlæs betalingsmurens status med det samme efter oplåsning. Den gamle status sendte brugeren tilbage én gang.
16. 🟢 Giv statuskoder for cron-jobs og workflow-scheduler på Monitoring-siden.
17. 🟢 Ryd op i de mange gamle worktrees og åbne PR'er fra september og oktober.

### Salg og CRM
18. 🔴 Opret deals med tilbud og faktura samlet i ét trin efter konvertering.
19. 🟠 Bed om værdi og lukkedato ved konvertering af lead, i stedet for at starte på 0 kr. uden dato.
20. 🟠 Fjern "Deal:"-præfikset i konverterede deals. Det ser dobbelt ud som "Deal: Deal: …".
21. 🟠 Fjern tomme linjer som "Phone:" fra noter ved konvertering.
22. 🟠 Vis kundens firmanavn på dealen, når leadet har et firma.
23. 🟠 Vis en samlet advarsel for deals med passeret lukkedato.
24. 🟠 Skjul "Mark as Lost" eller vis "Genåbn deal", når dealen er vundet.
25. 🟠 Gør "Edit stages" konsistent: den siger "ingen stadier", mens pipelinen viser fem standardstadier.
26. 🟠 Vis sandsynlighed pr. fase og et vægtet pipeline-tal.
27. 🟠 Tilføj årsag ved tabt deal som et valg, og vis en rapport over årsager.
28. 🟠 Lad ICP-scoring udelade kunder, eller markér dem som kunder.
29. 🟠 Vis hvad ICP-scoren består af, så 33 kan forklares.
30. 🟠 Gør "Prepare follow-up" til en forhåndsvisning med rediger før oprettelse.
31. 🟢 Sammenlæg dubletter med forslag, ikke kun afvisning.
32. 🟢 Forslag til næste handling på hver lead uden "Add next step".
33. 🟢 Masseredigering af status, ejer og mapper på leads.
34. 🟢 Gemte filtre deles med hele teamet.
35. 🟢 Påmindelser for leads uden aktivitet, som kan slås til og fra.
36. 🟢 Kundehistorik på tværs af kontakter i samme firma.
37. 🟢 Tidslinjefilter på noter, mail, faktura og opgaver.

### Økonomi
38. 🔴 Bloker afsendelse af fakturaer, hvis afsenders CVR eller adresse mangler. I dag er det kun en advarsel.
39. 🔴 Fortryd for "Markér betalt" eller en krediteringsvej, så en fejlregistrering kan rettes.
40. 🟠 Vis kundenavn i tilbudslisten. Den viser kun nummer, status og beløb.
41. 🟠 Link mellem tilbud, faktura og deal begge veje.
42. 🟠 Tilbudstitel og nummer som to felter i stedet for ét.
43. 🟠 Rykkerforløb for forfaldne fakturaer med dansk rykkergebyr og rente.
44. 🟠 Vis tydeligt når en kladde bliver markeret betalt uden at være sendt, med tekst der er lettere at læse.
45. 🟠 Automatisk matchning af bankbetalinger.
46. 🟠 Kreditnotaer som egen type i stedet for sletning.
47. 🟠 Brug dagens kurs og vis den, når valuta omregnes. Deals bruger i dag et fast tal.
48. 🟠 Vis at fakturaer altid står i DKK, når visningen er sat til EUR.
49. 🟢 E-faktura (OIOUBL/Peppol) til offentlige kunder.
50. 🟢 Faste fakturaer med automatisk gentagelse.
51. 🟢 Likviditetsprognose ud fra åbne fakturaer og løn.
52. 🟢 Eksport til revisor pr. periode.
53. 🟢 Delvise betalinger direkte fra fakturalisten.

### HR og tid
54. 🟠 Ferieoverblik med saldo pr. medarbejder.
55. 🟠 Vis overlappende fravær i teamet ved ansøgning.
56. 🟠 Vis fejl ved det rigtige felt i løn og fravær, ikke kun som toast.
57. 🟠 Lønfelt med "-100" bør vise fejl med det samme ved indtastning.
58. 🟠 Godkendelsesflow for vagtbytte.
59. 🟠 Påmindelse ved glemt udstempling.
60. 🟢 Eksport af løn til DataLøn eller Zenegy.
61. 🟢 Organisationsdiagram med ledere.
62. 🟢 Onboardingliste for nye medarbejdere.
63. 🟢 Dokumenter pr. medarbejder med adgangsstyring.

### Sprog og tekst
64. 🔴 Oversæt administratorsiderne. "Admin Overblik" og "Opdater" står på dansk på /en.
65. 🟠 Oversæt "KØRSLER · AKTIV" i Workflow Studio.
66. 🟠 Oversæt workflow-skabeloner. De står på engelsk på /da, fordi de ligger i databasen.
67. 🟠 Oversæt CVR-fejl. Den er dansk på /en og siger "prøv igen om lidt" om en brugt kvote.
68. 🟠 Ryd de 126 steder med `t('…') || 'tekst'`, som kan skjule manglende nøgler.
69. 🟠 Lad CI fejle på manglende oversættelsesnøgler.
70. 🟠 Vis webhook-hændelser med læsbare navne i stedet for `lead.created`.
71. 🟢 Ens tone (du/I) i alle danske tekster.
72. 🟢 Tysk ordliste for faste CRM-begreber.
73. 🟢 Følg brugerens sprog i notifikationer, fx "Vagt slettet".

### Brugervenlighed
74. 🔴 Erstat beskeden "Check the fields and try again" ved AI-fejl. Brugeren kan ikke rette noget selv.
75. 🟠 Vis AI-fejl i selve panelet. "Summarize relationship" gav ingen synlig fejl i panelet.
76. 🟠 Erstat browserens `confirm()` i opgaver og webhooks med appens dialoger.
77. 🟠 Tilføj aria-label på 37 ikonknapper uden tekst.
78. 🟠 Vis "Du logges snart ud" med en tydelig Bliv logget ind-knap også på mobil.
79. 🟠 Fjern "Webhooks: Logs"-fanen eller vis tom tilstand. Den reagerede ikke i klik-testen.
80. 🟠 Tastaturgenveje til Ny lead, Ny opgave og Søg.
81. 🟠 Tomme tilstande med næste skridt på alle lister.
82. 🟠 "New message" bør forklare, hvordan man inviterer kolleger, når der ingen er.
83. 🟢 Gennemgå layout ved 375 px for dashboard, fakturaer og betalinger, hvor enkelte elementer går ud over kanten.
84. 🟢 Samlet indstillingsside med søgning.
85. 🟢 Kommandopalet med handlinger, ikke kun navigation.
86. 🟢 Mørkt tema gennemgået side for side.
87. 🟢 Visningsvalg (kompakt/komfortabel) husket pr. liste.

### Sikkerhed og kode
88. 🔴 Fjern eller begræns Leadfeeder-sporing inde i den loggede app, og tjek at den kun kører efter samtykke.
89. 🟠 To-faktor-login for administratorer og system_admin.
90. 🟠 Log hvert systemadministrator-opslag på tværs af virksomheder.
91. 🟠 Ret sitemap, robots og hreflang til `www`-domænet, som apex-domænet alligevel sender videre til.
92. 🟠 Gør adgangskodekrav ens ved oprettelse og nulstilling (mindst 8 tegn og styrkemåler).
93. 🟠 Del `LeadsPage.tsx` (1.423 linjer) og `InvoicesPage.tsx` (1.274 linjer) op.
94. 🟠 Fjern ubrugte sider som den gamle `Leads.tsx` og `Employees.tsx`.
95. 🟠 Gør de to tidsfølsomme tests stabile, så de ikke fejler i fuld kørsel.
96. 🟠 Tilføj `.env.test` med dummy-værdier, så tests kan køre i et nyt worktree.
97. 🟢 Paginér de 21 forespørgsler uden `limit`.
98. 🟢 Automatisk end-to-end-test af flowet lead → betaling i CI mod et staging-miljø.
99. 🟢 Eget staging-miljø med testdata, så QA ikke skal skrive i produktion.
100. 🟢 Reducér `index`-bundlet på 680 KB med mere opdeling.

## Opdatering 31. oktober 2026: udrulning af edge functions

Udrullet til produktion (`vbxlpxhvojlaisxcipyh`) efter brugerens ja: 20 funktioner i alt: de 19, der bruger `_shared/aiConnection.ts` eller `_shared/operatingModelRouter.ts`, plus `check-subscription`. Alle 20 fik ny version og står som ACTIVE. Ingen andre funktioner og ingen `verify_jwt`-værdier ændrede sig. De øvrige 43 funktioner er ikke rørt, fordi deres kode ikke er ændret.

Verificeret i produktion:

- `ai-health`: 200, online.
- `check-subscription`: 200, returnerer `status: none` og `trial_ends_at: 2099-12-31`. Abonnementssiden låser ikke længere appen.
- Deal Coach på QA-TEST-deal: virker.
- Relationsopsummering på QA-TEST-lead: virker, på dansk.
- `workflow-assistant`: 200, svar på dansk (skrivebeskyttet spørgsmål).

Ikke verificeret: `Test-kør` i Workflow Studio, fordi de fire flows ikke er QA-TEST-data, og de øvrige AI-funktioner. Meta Ads er uden for testen, men `meta-ads-ai` er udrullet med samme rettelse.

Rettelse til rapporten: ikke 3, men 14 funktioner findes kun i produktion og ikke i repoet: `ai-connection`, `ai-message`, `cold-caller`, `create-invoice-checkout-session`, `integration-intelligence`, `meta-leadgen-webhook`, `mobile-pairing`, `phone-identity-verify`, `stripe-webhook`, `telephony-connections`, `telnyx-credential`, `telnyx-numbers`, `telnyx-webhook`, `verify-admin-code`.

Nye fund:

| Id | Alvor | Fund |
|---|---|---|
| R20-19 | Medium | `supabase/config.toml` peger på `inyrwsygghdjhmqejgwk`, som ikke er på kontoens projektliste. Produktion skal altid udrulles med `--project-ref vbxlpxhvojlaisxcipyh`. |
| R20-20 | Medium | `voice-telephony` har `verify_jwt=false` i produktion, men config.toml giver `true`. En fuld udrulning ville slå JWT-krav til. Afklar hvilken værdi der er rigtig, før funktionen udrulles. |
| R20-21 | Medium | Deal Coach svarer på engelsk i den danske brugerflade. |
| R20-22 | Lav | Rå status vises: `paid` på kundens tidslinje og `won` under Deals på lead-arket. |
| R20-23 | Lav | Dobbelt præfiks på tidslinjen: "Deal: Deal: QA-TEST Lead R20". |
| R20-24 | Lav | Abonnementssiden viser "Ingen abonnement" og "Start 14-dages gratis prøveperiode", selv om prøveperioden løber til 2099. |

R20-21 til R20-24 er rettet. På abonnementssiden skjules startknappen under en prøveperiode givet direkte på virksomheden, fordi `create-checkout` ellers ville overskrive `trial_ends_at` med 14 dage.

## Lanceringsblokeringer, 31. oktober 2026

Branch: `claude/launch-blockers-2026-10-31`. Intet herfra er udrullet.

### Funktioner hentet fra produktion

De 14 funktioner, der kun fandtes i produktion, ligger nu i repoet sammen med de delte filer, de bruger (`_shared/ai/`, `integration-taxonomy.ts`, `verificationProvider.ts`). `verify_jwt` står i `config.toml` med de live værdier. Scanningen fandt ingen hårdkodede hemmeligheder. Repoets `_shared/auth.ts` er bevaret. Den afviger fra produktions bundle med en fastlåst supabase-js-version og en bredere brugertype.

Kendte huller:

- Fire typefiler under `_shared/ai/` fandtes ikke i den udrullede bundle, fordi de kun bruges som `import type`. De er hentet fra git-historikken. `supabase start` fejler uden dem.
- `deno check` består for 9 af 15 kontrollerede funktioner. Fejlene i `cold-caller`, `create-invoice-checkout-session`, `meta-leadgen-webhook`, `phone-identity-verify` og `stripe-webhook` er typefejl i den kode, der allerede kører i produktion. De er ikke rettet.

### Tenant-isolation

- CI kører `tenant-isolation.integration.test.ts` mod en lokal database med hele migrationshistorikken. Den består.
- Produktion, skrivebeskyttet: RLS er slået til på alle 128 tabeller. Ingen politik på tabeller med `company_id` er åben for alle indloggede. Alle views bruger `security_invoker`.
- `oauth_states`, `phone_pairing_rate_limits` og `telnyx_webhook_events` har RLS uden politik og er dermed lukket for klienter.
- Uden login gav 117 tabeller ingen kundedata. Den ene række i `onboarding_templates` er den globale standardskabelon.
- Mangler: læsning af andre virksomheders rækker som indlogget bruger og skriveforsøg på tværs af virksomheder i produktion. Den indloggede test kræver login.

### Prøveperiode

- `hasSubscriptionAccess` (`src/lib/subscriptionAccess.ts`) giver adgang ved `active` eller en fremtidig `trial_ends_at`. Status `trialing` alene giver ikke adgang.
- `create-checkout` sætter ikke længere `trialing` og `trial_ends_at`, når betalingssiden oprettes. Status kommer fra Stripe via `check-subscription`.
- En virksomhed, der allerede har haft en prøveperiode, får ikke en ny.
- Kunden sendes tilbage til abonnementssiden efter betaling og videre til dashboardet, når status er synkroniseret.
- Håndhævelsen rammer 3 virksomheder: OpenAI, Visual Review Co og Debug Test Company. De har hver 1 bruger og 0 leads.
- Runde 20's rettelse af `check-subscription` gjorde et afbrudt checkout til gratis adgang uden udløb. Denne ændring lukker det hul.
- Spærringen ligger kun i frontenden. RLS og edge functions afviser ikke en virksomhed med udløbet prøveperiode.

### Nye fund

| Id | Alvor | Fund |
|---|---|---|
| R20-25 | High | `STRIPE_WEBHOOK_SECRET` mangler i produktion. `stripe-webhook` svarer 500, så fakturabetalinger via Stripe bliver ikke registreret. Kræver webhook-endpoint i Stripe og secret. |
| R20-26 | Medium | `stripe-webhook` håndterer kun fakturabetalinger. Abonnementsstatus opdateres først, når nogen åbner appen og `check-subscription` kører. |
| R20-27 | Medium | `verify-admin-code` sammenligner koden uden begrænsning på antal forsøg, og enhver indlogget bruger kan kalde den. |
| R20-28 | Lav | `create-checkout` falder tilbage til `bridge-orbit-core.lovable.app`, hvis `Origin` mangler. |
