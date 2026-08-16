
# Mål

Workspacet skal kunne drive en stor forretning med to mennesker. Det betyder ikke "flere features" — det betyder at de eksisterende moduler **taler sammen**, og at en **autopilot-agent** udfører rutinearbejdet i baggrunden.

I dag er CRM, Inbox, Finance, Marketing, HR, Workflows og MCP isolerede. Vi bygger fire lag der binder dem sammen:

```text
┌────────────────────────────────────────────────┐
│  AI clients (Claude Code, Desktop, Cursor)     │
│  + intern Autopilot Agent                      │
└──────────┬──────────────────────┬──────────────┘
           │ MCP tools            │ MCP tools
┌──────────▼──────────────────────▼──────────────┐
│  Event Bus  (signals + subscriptions)          │
│  lead.created · email.received · deal.won …    │
└──────────┬──────────────────────┬──────────────┘
           │                      │
┌──────────▼──────────┐  ┌────────▼──────────────┐
│  Modules (CRM,      │  │  Workflows + Webhooks │
│  Inbox, Finance…)   │  │  (Zapier/n8n/AP)      │
└─────────────────────┘  └───────────────────────┘
```

# Hvad vi bygger denne tur

## 1 · Event Bus (database-spinen)

Én tabel `workspace_events` der registrerer alt der sker (lead created, email received, deal moved, invoice paid, task completed, integration fired). DB-triggers på de eksisterende tabeller emitter events automatisk — modulerne behøver ikke ændres.

En tabel `event_subscriptions` siger hvilke events der skal trigge hvad: en workflow, en webhook, eller autopilot-agenten.

Realtime aktiveres så UI'et reagerer øjeblikkeligt på tværs af moduler (en deal-vinding popper op i Inbox som suggested follow-up; en ny lead vises i Autopilot's kø).

## 2 · Udvidet MCP — fuld operationel toolkit

`mcp-server` får tilføjet de tools der mangler for at drive forretningen end-to-end:

- **CRM**: `update_lead_status`, `move_deal_stage`, `score_lead`, `link_lead_to_deal`
- **Kommunikation**: `send_email_via_gmail`, `draft_email`, `summarize_thread`
- **Finance**: `create_invoice`, `mark_invoice_paid`, `list_overdue_invoices`
- **HR**: `list_employees`, `create_task_for`
- **Marketing**: `launch_meta_campaign_draft`, `generate_call_script`
- **Workflow/Automation**: `run_workflow`, `list_workflows`, `emit_event`
- **Intelligens**: `daily_brief`, `find_at_risk_deals`, `suggest_next_actions`

Hver tool er stadig scoped til `company_id` via mcp-token resolve.

## 3 · Autopilot Agent (intern)

Edge function `autopilot-agent` der bruger Lovable AI Gateway + Vercel AI SDK med samme MCP-tools som Claude Code. Den kører i to modes:

- **On-demand**: Bruger skriver i Autopilot-siden ("ryd op i pipeline, send tilbud til Acme, find leads i Aarhus") → agenten planlægger, kalder tools, viser steps live.
- **Scheduled / event-drevet**: Når et event matcher en subscription (fx `email.received` med tag "tilbud"), affyrer agenten og foreslår eller udfører handlinger (afhængig af `needsApproval`).

Agentens forslag landes i en `autopilot_actions`-tabel med states `proposed`, `approved`, `executed`, `dismissed` — så de to mennesker reviewer i stedet for at gøre.

## 4 · Autopilot-siden (redesign)

Den side de står på lige nu (`/en/app/autopilot`) bliver **the cockpit**:

- **Live signal feed** (events der streamer ind via realtime)
- **Agent chat** (skriv intentioner; se tool-kald udfolde sig)
- **Action queue** (foreslåede handlinger med ét-klik approve)
- **Daily brief** øverst (auto-genereret hver morgen)

UI'et bruger `useChat` fra AI SDK, renderer `message.parts` så tool-kald vises som kort (lead-kort, deal-kort, email-kort) — ikke kun JSON.

## 5 · Cross-module sammenhæng (konkrete beviser på "alt hænger sammen")

- Ny **lead** → autopilot scorer → hvis ICP > 70 → forslag om opret deal + kalender-invite via webhook-bro.
- **Email** modtaget → autopilot kategoriserer → ved "tilbud" → udkast oprettes i Smart Inbox + opgave på sælger.
- **Deal won** → invoice-draft i Finance + Slack-besked via webhook + onboarding-task i HR.
- **Invoice overdue** → autopilot drafter rykker, sætter follow-up task, opdaterer deal health.
- Alt logges i `workspace_events`, alt kan sees i Autopilot's signal feed.

# Tekniske detaljer

**Database**
- `workspace_events(id, company_id, type, source_module, entity_type, entity_id, payload jsonb, actor_user_id, created_at)` + RLS pr. company_id, realtime publication.
- `event_subscriptions(id, company_id, event_pattern, action_type ['workflow'|'webhook'|'autopilot'], action_ref, is_active)`.
- `autopilot_actions(id, company_id, suggested_by, action_type, payload, status, executed_at, result jsonb)`.
- DB-triggers på `leads`, `deals`, `tasks`, `invoices`, `emails` der inserter rows i `workspace_events` (genbruger eksisterende activity-log-mønster).

**Edge functions**
- `autopilot-agent` (ny): Hono + AI SDK + `streamText` med tools fra `mcp-server`. Tools genbruges som lokal modul-import for at undgå dobbelt vedligehold. Bruger Lovable AI Gateway (`google/gemini-3-flash-preview`).
- `event-dispatcher` (ny): Lytter via supabase realtime (eller cron-poller hvert 10. sek) og fan-outer til workflows/webhooks/autopilot baseret på `event_subscriptions`.
- `mcp-server` (udvides): tilføjer ~15 nye tools listet ovenfor.

**Frontend**
- `src/pages/app/AutopilotPage.tsx` redesignes til cockpit-layout (3 kolonner: feed | chat | queue). Mobile: tabs.
- `src/hooks/api/useWorkspaceEvents.ts`, `useAutopilotActions.ts`.
- `src/components/autopilot/{SignalFeed,AgentChat,ActionQueue,DailyBrief}.tsx`.
- AI SDK installeres (`ai`, `@ai-sdk/react`, `@ai-sdk/openai-compatible`).

**Sikkerhed**
- Alle nye tabeller scoped til company_id via eksisterende `get_user_company_id` mønster.
- Autopilot edge function bruger MCP-token (samme path som AI clients) for actor-binding.
- Tools der mutere data har `needsApproval: true` med mindre brugeren har slået "auto-execute" til pr. event-type.

# Ud af scope (næste tur)

- Native OAuth pr. provider (vi bliver ved webhook-bro per memory).
- Ny faktureringslogik (Finance-modulet bruges som det er).
- Mobile-specifik agent UI (laves når cockpittet er stabilt).

# Næste skridt

Hvis du godkender: jeg bygger 1 → 2 → 3 → 4 i den rækkefølge i denne tur, med Autopilot-siden som synlig endpoint så du kan se det virke med det samme.
