# CRM SDR Agent

Autonom AI salgsassistent der kører 24/7. Kvalificerer leads med Groq (llama-3.3-70b-versatile), sender personaliserede danske emails inden for 60 sekunder, opretter opgaver efter hver handling, sender morgenrapporter kl. 08:00 dansk tid, sender fakturapåmindelser 3 dage inden forfald og håndterer HR-onboarding af nye medarbejdere.

---

## Indhold

- [Arkitektur](#arkitektur)
- [Supabase opsætning](#supabase-opsætning)
- [Tilføj virksomhed (tenant)](#tilføj-virksomhed-tenant)
- [Webhook — modtag leads](#webhook--modtag-leads)
- [Forbind Meta Ads](#forbind-meta-ads)
- [Railway deployment](#railway-deployment)
- [Lokalt udviklingsmiljø](#lokalt-udviklingsmiljø)

---

## Arkitektur

```
crm-sdr-agent/
├── main.py                  # FastAPI app entry point
├── agent_worker.py          # APScheduler — kører baggrundsjobs
├── requirements.txt
├── Procfile                 # Railway: web + worker processer
├── railway.json
├── .env.example
├── agents/
│   ├── qualification_agent.py   # Groq lead scoring 1–10
│   ├── email_agent.py           # Dansk email via Groq + SMTP
│   ├── summary_agent.py         # Morgenrapport per tenant
│   ├── invoice_agent.py         # Fakturapåmindelser 3 dage før forfald
│   └── hr_agent.py              # Velkomst-email + 5 onboarding opgaver
├── api/
│   ├── routes.py                # REST endpoints (/agent/status, /tenant/...)
│   └── webhook.py               # /webhook/new-lead + /webhook/meta-lead
├── db/
│   ├── supabase_client.py       # Singleton Supabase service-key klient
│   └── queries.py               # Alle DB queries med tenant-isolation
└── config/
    └── tenant_loader.py         # In-memory tenant config cache (60s TTL)
```

### Automatiske jobs

| Job | Interval | Beskrivelse |
|-----|----------|-------------|
| `process_new_leads` | Hvert 30 sek | Scorer og emailer nye leads |
| `run_invoice_reminders` | Hvert 60 min | Sender påmindelser om fakturaer der forfalder om ≤3 dage |
| `run_hr_onboarding` | Hvert 5 min | Velkomst-email + 5 opgaver til nye medarbejdere |
| `run_morning_summaries` | Dagligt kl. 08:00 CPH | Dansk morgenrapport per tenant |

---

## Supabase opsætning

Kør disse SQL-statements i Supabase → SQL Editor.

### 1. Tenants tabel

```sql
create table if not exists public.tenants (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null,
  phone         text,
  product_description text,
  tone_of_voice text default 'professionel og venlig',
  calendly_link text,
  meta_page_id  text,        -- bruges til at matche Meta Ads leads
  smtp_host     text,
  smtp_port     integer default 587,
  smtp_user     text,
  smtp_password text,        -- krypteret / kun server-side adgang
  created_at    timestamptz default now()
);

-- Service key har fuld adgang — ingen RLS nødvendig for agent
alter table public.tenants enable row level security;
create policy "Service key bypass" on public.tenants
  using (true)
  with check (true);
```

### 2. Leads tabel

```sql
create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id),
  name        text not null,
  email       text,
  phone       text,
  company     text,
  source      text default 'manual',
  status      text default 'new',       -- new | contacted | qualified | lost
  score       integer,                  -- 1–10 sat af AI
  notes       text,
  created_at  timestamptz default now()
);

create index on public.leads(tenant_id, status);
create index on public.leads(created_at);
```

### 3. Tasks tabel

```sql
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id),
  lead_id     uuid references public.leads(id),
  description text not null,
  done        boolean default false,
  created_at  timestamptz default now()
);

create index on public.tasks(tenant_id, done);
```

### 4. Agent logs tabel

```sql
create table if not exists public.agent_logs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id),
  lead_id     uuid references public.leads(id),
  action      text not null,
  result      text,
  created_at  timestamptz default now()
);

create index on public.agent_logs(tenant_id, created_at desc);
```

### 5. Invoices tabel (hvis ikke allerede oprettet)

```sql
create table if not exists public.invoices (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id),
  client_name text not null,
  client_email text not null,
  amount      numeric(12,2),
  currency    text default 'DKK',
  due_date    date not null,
  status      text default 'unpaid',   -- unpaid | paid | overdue
  description text,
  created_at  timestamptz default now()
);

create index on public.invoices(due_date, status);
```

### 6. Profiles / Employees tabel (hvis ikke allerede oprettet)

```sql
create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id),
  name        text not null,
  email       text not null,
  role        text default 'employee',
  created_at  timestamptz default now()
);
```

---

## Tilføj virksomhed (tenant)

### Via API (anbefalet)

```bash
curl -X POST https://din-railway-url.railway.app/tenant/create \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme ApS",
    "email": "kontakt@acme.dk",
    "phone": "+45 12 34 56 78",
    "product_description": "Vi leverer AI-drevne marketingløsninger til B2B-virksomheder",
    "tone_of_voice": "professionel, direkte og hjælpsom",
    "calendly_link": "https://calendly.com/acme/30min"
  }'
```

Svar:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Acme ApS",
  ...
}
```

Gem `id` — det er dit `tenant_id` til alle fremtidige kald.

### Via Supabase SQL Editor

```sql
insert into public.tenants (name, email, product_description, tone_of_voice, calendly_link)
values (
  'Acme ApS',
  'kontakt@acme.dk',
  'Vi leverer AI-drevne marketingløsninger til B2B-virksomheder',
  'professionel, direkte og hjælpsom',
  'https://calendly.com/acme/30min'
)
returning id;
```

---

## Webhook — modtag leads

### Direkte lead webhook

Send et lead direkte til agenten. Agenten returnerer 202 straks og behandler i baggrunden.

```
POST https://din-railway-url.railway.app/webhook/new-lead
Content-Type: application/json

{
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Lars Jensen",
  "email": "lars@firma.dk",
  "phone": "+45 88 88 88 88",
  "company": "Firma A/S",
  "source": "hjemmeside"
}
```

Svar: `202 Accepted` — agenten kører i baggrunden og:
1. Scorer lead 1–10 med Groq
2. Sender dansk personaliseret email hvis score ≥ 6
3. Opretter en opgave til sælger
4. Logger handlingen i `agent_logs`

### Test med curl

```bash
curl -X POST https://din-railway-url.railway.app/webhook/new-lead \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "DIT-TENANT-ID",
    "name": "Test Person",
    "email": "test@example.dk",
    "phone": "+45 00 00 00 00",
    "company": "Test Firma",
    "source": "curl-test"
  }'
```

---

## Forbind Meta Ads

Meta Ads Lead Gen Forms kan sende leads automatisk til agenten via webhook.

### Trin 1 — Find din Meta Page ID

1. Gå til din Facebook-side
2. Om-siden → Find "Side-ID" (et langt tal, fx `123456789012345`)

### Trin 2 — Gem Page ID på tenant

```bash
curl -X PUT https://din-railway-url.railway.app/tenant/DIT-TENANT-ID/meta-page \
  -H "Content-Type: application/json" \
  -d '{"meta_page_id": "123456789012345"}'
```

Eller direkte i Supabase:

```sql
update public.tenants
set meta_page_id = '123456789012345'
where id = 'DIT-TENANT-ID';
```

### Trin 3 — Konfigurer Meta webhook

1. Gå til [Meta for Developers](https://developers.facebook.com/) → Din app → Webhooks
2. Tilføj nyt webhook-abonnement:
   - **Callback URL**: `https://din-railway-url.railway.app/webhook/meta-lead`
   - **Verify Token**: `aiagency_meta_verify`
   - **Abonner på**: `leadgen`
3. Klik "Verify and Save"

### Trin 4 — Test

Opret et test-lead via Meta's Lead Ads Testing Tool i Facebook Business Manager.
Tjek agent-logs:

```bash
curl https://din-railway-url.railway.app/agent/status/DIT-TENANT-ID
```

### Meta lead format (intern reference)

Agenten modtager dette format fra Meta og mapper felterne automatisk:

```json
{
  "entry": [{
    "changes": [{
      "value": {
        "page_id": "123456789012345",
        "leadgen_id": "987654321",
        "form_id": "111222333",
        "field_data": [
          {"name": "full_name", "values": ["Lars Jensen"]},
          {"name": "email", "values": ["lars@firma.dk"]},
          {"name": "phone_number", "values": ["+4588888888"]}
        ]
      }
    }]
  }]
}
```

---

## Railway deployment

### Forudsætninger

- [Railway CLI](https://docs.railway.app/develop/cli) installeret
- Railway-konto med et projekt oprettet

### Første gang

```bash
# Fra roden af crm-sdr-agent/
cd crm-sdr-agent

# Login og link til Railway projekt
railway login
railway link

# Sæt miljøvariabler
railway variables set \
  SUPABASE_URL="https://xxxx.supabase.co" \
  SUPABASE_SERVICE_KEY="eyJ..." \
  GROQ_API_KEY="gsk_..." \
  SMTP_HOST="smtp.gmail.com" \
  SMTP_PORT="587" \
  SMTP_USER="din@gmail.com" \
  SMTP_PASSWORD="xxxx xxxx xxxx xxxx"

# Deploy
railway up
```

Railway starter automatisk to processer fra `Procfile`:
- `web` — FastAPI REST API (skalerer med `$PORT`)
- `worker` — APScheduler baggrundsjobs

### Opdater efter kodeændringer

```bash
railway up
```

### Se logs

```bash
railway logs
```

### Miljøvariabler oversigt

| Variabel | Beskrivelse | Eksempel |
|----------|-------------|---------|
| `SUPABASE_URL` | Supabase projekt URL | `https://abc.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service role key (fuld adgang) | `eyJ...` |
| `GROQ_API_KEY` | Groq API nøgle — gratis på console.groq.com | `gsk_...` |
| `SMTP_HOST` | SMTP server | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | Afsender email | `agent@firma.dk` |
| `SMTP_PASSWORD` | App-adgangskode (Gmail: 2FA → App Passwords) | `xxxx xxxx xxxx xxxx` |
| `PORT` | HTTP port — sættes automatisk af Railway | `8000` |

---

## Lokalt udviklingsmiljø

```bash
cd crm-sdr-agent

# Kopiér og udfyld miljøvariabler
cp .env.example .env
# Rediger .env med dine værdier

# Opret virtuelt miljø
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Installér afhængigheder
pip install -r requirements.txt

# Start API server
uvicorn main:app --reload --port 8000

# Start worker i separat terminal
python agent_worker.py
```

API dokumentation tilgængelig på: `http://localhost:8000/docs`

---

## API endpoints reference

| Method | Endpoint | Beskrivelse |
|--------|----------|-------------|
| `GET` | `/health` | Healthcheck |
| `GET` | `/agent/status` | Seneste 20 logs på tværs af alle tenants |
| `GET` | `/agent/status/{tenant_id}` | Seneste 20 logs for specifik tenant |
| `GET` | `/tenant/{tenant_id}` | Tenant info |
| `POST` | `/tenant/create` | Opret ny tenant |
| `GET` | `/tenant/{tenant_id}/leads` | Leads for tenant (`?status=new`) |
| `GET` | `/tenant/{tenant_id}/summary` | Generer morgenrapport nu |
| `POST` | `/webhook/new-lead` | Modtag nyt lead (202 straks, agent i baggrund) |
| `POST` | `/webhook/meta-lead` | Meta Ads Lead Gen webhook |
| `GET` | `/webhook/meta-lead` | Meta webhook verifikation |
