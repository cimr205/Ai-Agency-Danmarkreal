# Mastra Agent Map — AI Agency Danmark

**Status:** PLANNING ONLY — no department agents implemented. This maps where Mastra agents should eventually operate, aligned to the app's **existing** AI action framework.
**Date:** 2026-10-17 · **Branch:** `chore/mastra-install` (isolated worktree) · **Base:** `feature/frontend-operating-system`

> This map does not change any behaviour. It is a design artifact for Phase-5 work.

---

## How this aligns with the existing architecture

The app already has a production AI layer — Mastra must **wrap/extend it, not replace it**:

- **Provider-agnostic model routing** — `supabase/functions/_shared/operatingModelRouter.ts` + `aiConnection.ts` resolve a single OpenAI-compatible endpoint from env (`LOCAL_LLM_BASE_URL`, `LOCAL_LLM_MODEL`, `LOCAL_LLM_FAST_MODEL`, `LOCAL_LLM_REASONING_MODEL`, `LOCAL_LLM_API_KEY`; currently OpenRouter). Mastra agents should reuse the same env contract.
- **Existing action framework** — `supabase/functions/ai-operating-manager/index.ts` already defines actions with `requiredRoles`, `requiredFields`, `risk` (low/medium/high/critical), `connector` (internal | email.send | integration), and `rollback`. Proposed write actions below reuse these exact action names and risk levels.
- **Auth & tenancy** — every edge function uses `requireCompanyAuth` (Supabase session → `companyId` + role). Data access is RLS-scoped per tenant. Agents must run **behind** `requireCompanyAuth` and never bypass RLS.
- **Roles** — `system_admin` / `owner` / `company_admin` / `manager` / `employee` / `readonly`.

**Approval rule convention (used in every table):**
`auto` = low-risk, no human approval · `confirm` = medium-risk, in-UI confirmation · `approve` = high/critical, explicit approver (manager+) before execution. Mirrors the existing `risk` field.

---

## Department agent map

### CRM
| Field | Value |
|---|---|
| Existing functionality | Leads, Deals, Pipeline, ICP finder, Lead generation chat (`crm/*`, `useLeadsPaginated`, `useDeals`, edge fns `lead-ai-recommend`, `lead-generation-chat`) |
| Proposed agent | **CRM Agent** — lead triage, next-best-action, deal-risk summaries |
| Required data (read) | `leads`, `deals`, `activities`, `customers`, pipeline stages |
| Read-only tools | `listLeads`, `getLead`, `listDeals`, `getPipeline`, `getDealActivity` |
| Proposed write actions | `crm.lead.create` (confirm), `crm.lead.update` (confirm), `crm.customer.create` (confirm), `crm.customer.update` (confirm), deal stage move (approve if value > threshold) |
| Permissions / approval | member roles; create/update = `confirm`; deleting/merging = `approve` |
| Integration gaps | No embeddings/vector store for semantic lead matching; ICP scoring is rule-based today |

### Sales
| Field | Value |
|---|---|
| Existing functionality | Deals, quotes, deal coach (`deal-coach` edge fn), Power Dialer / cold-caller, call scripts (`generate-call-script`) |
| Proposed agent | **Sales Agent** — quote drafting, follow-up scheduling, call-script generation |
| Required data (read) | `deals`, `quotes`, `customers`, call logs |
| Read-only tools | `getDeal`, `listQuotes`, `getCustomer`, `getCallHistory` |
| Proposed write actions | `finance.quote.create` (confirm), `tasks.create` follow-up (auto), schedule call (confirm) |
| Permissions / approval | manager+ for quotes affecting price; `confirm` otherwise |
| Integration gaps | No pricing-rules engine; quote totals computed client-side (`invoicePdf.ts`) |

### Marketing
| Field | Value |
|---|---|
| Existing functionality | Meta Ads (`marketing/meta-ads`, `meta-ads-ai`, `meta-publish-campaign`), campaigns, bulk email |
| Proposed agent | **Marketing Agent** — campaign copy, audience suggestions, ad performance summaries |
| Required data (read) | Meta Ads metrics, campaign tables, lead sources |
| Read-only tools | `getAdMetrics`, `listCampaigns`, `getAudienceInsights` |
| Proposed write actions | draft campaign (confirm), **publish campaign** (`approve` — spends budget / public), pause campaign (confirm) |
| Permissions / approval | publish/spend = `approve` (company_admin+); drafts = `confirm` |
| Integration gaps | Meta OAuth token lifecycle; no budget-guardrail primitive — **publish must stay human-approved** |

### Finance
| Field | Value |
|---|---|
| Existing functionality | Invoices, quotes, payments (`finance/*`, `invoicePdf.ts`) |
| Proposed agent | **Finance Agent** — invoice drafting, overdue detection, payment reconciliation summaries |
| Required data (read) | `invoices`, `quotes`, `payments`, `customers` |
| Read-only tools | `listInvoices`, `getInvoice`, `listPayments`, `agingReport` |
| Proposed write actions | `finance.invoice.create` (confirm), mark paid (approve), send invoice email (approve — external) |
| Permissions / approval | anything touching money/external send = `approve` (company_admin+); read/report = `auto` |
| Integration gaps | No payment-provider webhook reconciliation agent-side; VAT/currency rules live in UI |

### Operations
| Field | Value |
|---|---|
| Existing functionality | Tasks, Autopilot (`autopilot-agent/brief/execute`), Operating Manager, Workflow Studio |
| Proposed agent | **Operations Agent** — task orchestration, autopilot brief generation, workflow suggestions |
| Required data (read) | `tasks`, workflow defs, activity log |
| Read-only tools | `listTasks`, `getWorkflow`, `getActivityLog` |
| Proposed write actions | `tasks.create` (auto), `tasks.complete` (confirm), trigger workflow (approve) |
| Permissions / approval | task CRUD = member; workflow execution = `approve` (manager+) |
| Integration gaps | This is where Mastra best **complements** the existing Operating Manager action framework; need a shared action-schema bridge |

### HR
| Field | Value |
|---|---|
| Existing functionality | Employees, Attendance, Time Tracking, Work Schedule, Leave, Payroll, Recruitment (`hr/*`, `useWorkforce`, `useShifts`) |
| Proposed agent | **HR Agent** — schedule suggestions, leave-balance Q&A, recruitment screening summaries |
| Required data (read) | `employees`, `shifts`, `attendance`, `leave`, `payroll` (role-gated) |
| Read-only tools | `listEmployees`, `getSchedule`, `getLeaveBalance`, `getAttendance` |
| Proposed write actions | propose shift (confirm), approve leave (approve — manager+), payroll run (**approve**, critical) |
| Permissions / approval | payroll/leave approvals = `approve` (company_admin+); PII strictly RLS-scoped; **no payroll execution without human approval** |
| Integration gaps | Payroll calculation engine; sensitive-PII guardrails for prompts (avoid leaking salaries into model context) |

### Email
| Field | Value |
|---|---|
| Existing functionality | Emails, Inbox, Templates, Bulk, Gmail sync/send (`email/*`, `gmail-sync`, `gmail-send`, `ai-email-writer`) |
| Proposed agent | **Email Agent** — draft replies, summarize threads, triage/priority |
| Required data (read) | `emails`, threads, templates, linked `customers`/`deals` |
| Read-only tools | `listEmails`, `getThread`, `getTemplate` |
| Proposed write actions | draft reply (auto, stays in draft), **send email** (`approve` — external side effect) |
| Permissions / approval | sending = `approve` always (external, irreversible); drafting/summarizing = `auto` |
| Integration gaps | **Security:** email HTML is attacker-controlled (see QA-001 XSS fix). Agent must consume **sanitized text**, never raw `body_html`, to avoid prompt-injection from email content |

### Calendar
| Field | Value |
|---|---|
| Existing functionality | Calendar (`work/calendar`, `useCalendar`), task due dates |
| Proposed agent | **Calendar Agent** — scheduling, availability, meeting prep briefs |
| Required data (read) | calendar events, tasks, employee availability |
| Read-only tools | `listEvents`, `findAvailability`, `getTask` |
| Proposed write actions | create event (confirm), invite external (approve), reschedule (confirm) |
| Permissions / approval | external invites = `approve`; internal events = `confirm` |
| Integration gaps | No external calendar (Google/Outlook) sync primitive yet; timezone handling |

### Dashboard
| Field | Value |
|---|---|
| Existing functionality | Metrics, revenue trend, ambient insights (`Dashboard.tsx`, `useDashboard`, `useAmbientInsights`) |
| Proposed agent | **Insights Agent** — narrative KPI summaries, anomaly callouts, "what changed" |
| Required data (read) | aggregated metrics across CRM/finance/HR (read-only) |
| Read-only tools | `getDashboardMetrics`, `getRevenueTrend`, `getAnomalies` |
| Proposed write actions | none (read-only by design) |
| Permissions / approval | `auto` (read-only); must label AI narratives as generated |
| Integration gaps | Insights must be **grounded** in real tenant aggregates, not hallucinated — needs a metrics tool contract + guardrail |

### Integrations
| Field | Value |
|---|---|
| Existing functionality | Connected Apps, Webhooks, Meta/Gmail OAuth, MCP server (`workspace/connected-apps`, `settings/webhooks`, `mcp-server` edge fn) |
| Proposed agent | **Integrations Agent** — connection health, webhook triage, OAuth status |
| Required data (read) | integration configs, webhook logs, OAuth token status |
| Read-only tools | `listIntegrations`, `getWebhookLog`, `checkOAuthStatus` |
| Proposed write actions | retry webhook (confirm), rotate token (approve), enable integration (approve) |
| Permissions / approval | anything changing connectivity/secrets = `approve` (company_admin+) |
| Integration gaps | There is already an `mcp-server` edge function — Mastra tools could expose/consume MCP; define the trust boundary |

---

## Cross-cutting requirements before any department agent ships
1. **Model wiring** — connect Mastra to the existing OpenAI-compatible endpoint (`LOCAL_LLM_BASE_URL`…). Remaining dep: an OpenAI-compatible provider for the AI SDK (`@ai-sdk/openai-compatible`) **or** standard `OPENAI_API_KEY`. _(Live inference currently NOT TESTED — see MASTRA_INSTALL verification.)_
2. **Action bridge** — a shared schema mapping Mastra tool calls → the existing `ai-operating-manager` action definitions (reuse `risk`/`rollback`/`requiredRoles`).
3. **Approval surface** — reuse the existing confirm/approve UX; agents propose, humans approve for `confirm`/`approve` actions.
4. **Tenancy & auth** — agents execute server-side behind `requireCompanyAuth`; never bypass RLS; never run Mastra in the browser bundle.
5. **Prompt-injection hardening** — attacker-controlled content (emails, lead notes, web data) must be sanitized/escaped before entering model context.
6. **Observability** — reuse the existing action log; add agent-run tracing.
