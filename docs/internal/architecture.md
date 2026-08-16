# CRM Architecture (Internal)

## Overordnet
- Backend-first arkitektur med klare domæner og services.
- Frontend er kun UI og må ikke indeholde forretningslogik.
- CRM ejer alle salgsdata. HR er ekstern og refereres kun via `employee_id`.
- AI/telefoni og email håndteres som server-side services og events.

## Domæner
- `leads`
- `customers`
- `deals`
- `tasks`
- `activities` (email, calls, task)

## Services
- Email Service (inbound/outbound, tracking, logs)
- Telephony/AI Service (inbound/outbound calls, prompts, events)
- Pipeline Service (stage stats, aging)
- Task Service (opgaver og SLA)

## Data-ejerskab
- CRM ejer: leads, customers, deals, tasks, activities, emails, calls.
- HR ejer medarbejderdata; CRM refererer kun med `employee_id`.

## Events og flows
### Inbound email
1. Sync/webhook → Email Service
2. Activity logges
3. Lead/customer oprettes eller opdateres
4. Task kan oprettes via regler

### Inbound call
1. Webhook → Telephony/AI Service
2. Call activity logges
3. Task kan oprettes automatisk

### Outbound email (bulk/enkelt)
1. UI → API
2. Email Service renderer template med fallback
3. Activity + tracking logges

### Outbound call
1. UI → API
2. Telephony/AI Service starter opkald
3. Activity + task logges

## Konfiguration (server-side)
- Environment variables:
  - `VAPI_PRIVATE_KEY`
  - `VAPI_PUBLIC_KEY`

## White-label krav
- Ingen eksponering af underliggende providers i UI.
- Ingen secrets i frontend eller logs.

