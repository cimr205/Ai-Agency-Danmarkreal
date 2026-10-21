# AI Action Architecture — Decision Brief

**Status: BLOCKED_BY_OWNER.** This document maps the current state precisely
enough to decide from, and proposes three options. It does not choose one,
and no code in this repo has been changed to execute a consolidation.

## Why this exists

The product has accumulated four independent code paths that all do the same
underlying thing — "let something (a human or an AI) cause a side-effecting
action to happen in the CRM" — built at different times with no shared
abstraction. This document is the concrete map needed to decide whether,
when, and how to converge them.

## The four paths, as they exist today

### Path 1 — Workflow engine (event-driven automation)

| | |
|---|---|
| **Entrypoint** | DB trigger `enqueue_matching_workflows()` (fires on `workspace_events` insert) → `workflow_runs` / `workflow_step_runs` rows → drained by `supabase/functions/workflow-runner/worker.ts` (`drainDurableQueue`), invoked every 5 minutes by `.github/workflows/workflow-scheduler.yml` via a shared-secret-authenticated HTTP call |
| **Callers** | Nothing calls this directly from the frontend. It's purely reactive: any `workspace_events` row matching a workflow's `trigger_event`/`trigger_source`/`conditions` auto-enqueues |
| **Side effects** | Whatever the step's `step_type` does. Today the *entire* action registry (`supabase/functions/_shared/workflowActionRegistry.ts`) defines exactly **one** action: `webhook` (fire an HTTP POST to a configured URL) |
| **Auth model** | Service-role only; no per-call user auth (it's a background drain) |
| **Retry model** | Built-in: `claim_workflow_steps`/`finish_workflow_step` RPCs track `attempt_count`, lease-based claiming (120s lease), explicit `retryable` vs `dead_letter` vs `needs_attention` (ambiguous/uncertain outcome) terminal states |
| **Queue model** | Fully durable: `workflow_step_runs` is a real queue table with status, lease, idempotency_key. This is the only one of the four paths with genuine at-least-once delivery semantics and crash recovery |
| **Observability** | `get_system_health_summary()` (P12) now reports `workflow_steps_dead_lettered`, `workflow_steps_needing_attention`, `workflow_runs_stuck`, `workflow_queue_depth`. `sendCriticalAlert()` (P11) now fires on dead-letter and needs-attention, unbound |
| **Overlap with other paths** | None functionally — it only knows how to fire webhooks today. Architecturally it is the only path with a real durable queue, which the other three lack entirely |
| **Production usage** | 24 `workflows` rows configured, **0** `workflow_runs` ever executed. Built, wired, never actually triggered by real traffic |
| **Migration complexity if consolidating onto this path** | High — would require porting the rich internal-action vocabulary from Path 3 (CRM/HR/calendar actions) into `workflowActionRegistry.ts`, which currently only understands webhooks |

### Path 2 — Autopilot brief + execute (AI-suggests, human-approves, hardcoded executor)

| | |
|---|---|
| **Entrypoint** | `supabase/functions/autopilot-brief/index.ts` (AI generates a JSON list of suggested actions from CRM/HR/Finance data) → user clicks approve/skip in the UI → `supabase/functions/autopilot-execute/index.ts` (synchronous HTTP request) |
| **Callers** | Frontend "Daily Brief" UI only |
| **Side effects** | A hardcoded `if/else` chain in `autopilot-execute` keyed on `action.execution_function` string: send email (via `gmail-send`), move deal stage, create task, mark lead contacted, or a generic "create a task about it" fallback |
| **Auth model** | Standard `getUser()` + `profiles.company_id` lookup, correctly scoped |
| **Retry model** | **None.** Synchronous request/response; a failed `fetch` to `gmail-send` or a thrown error just returns `{success:false}` to the browser. No automatic retry, no backoff |
| **Queue model** | None — `autopilot_actions` is written to as an audit/history log of what was approved/skipped, not read back as a queue. Execution is immediate and in-request |
| **Observability** | None dedicated. Failures only surface as a toast in the browser that made the request |
| **Overlap with other paths** | Writes to the same `autopilot_actions` table as Path 3, but with a much thinner schema usage — **no `idempotency_key` is ever set on insert**, meaning a double-click or a retried request can double-log (and, for the approved+executed path, double-send an email / double-create a task) |
| **Production usage** | 3 rows in `autopilot_actions` exist today — this path has real (light) usage |
| **Migration complexity if consolidating onto this path** | Low ambition, but it's the least structurally sound of the four (no role checks, no typed field validation, no idempotency) — not a good consolidation target as-is |

### Path 3 — AI Operating Manager (structured action registry, proposal → approval → execution)

| | |
|---|---|
| **Entrypoint** | `supabase/functions/ai-operating-manager/index.ts`, a single large function handling multiple JSON actions (`propose`, `approve`, `reject`, `edit`, list-pending, etc.) |
| **Callers** | Frontend AI-operating-manager UI surface (separate from the Daily Brief UI in Path 2) |
| **Side effects** | A real typed registry (`ACTIONS` object) of ~15+ action kinds (`tasks.create`, `tasks.complete`, `crm.customer.create/update`, `crm.lead.create/move_stage`, `crm.deal.create/move_stage`, `calendar.event.create/update`, etc.), each with `requiredRoles`, typed `requiredFields`/`optionalFields`, a `risk` level, a `connector` classification, and a human-readable `rollback` description |
| **Auth model** | `requireCompanyAuth()` (the shared, correct helper also used by `webhook-dispatch` after its earlier fix) plus per-action `requiredRoles` checks against the caller's actual role |
| **Retry model** | No automatic retry — but every proposal carries a real `idempotency_key` (defaults to `crypto.randomUUID()`, or caller-supplied), checked against existing `autopilot_actions` rows before creating a duplicate |
| **Queue model** | Soft queue via `autopilot_actions.status` (`proposed` → `awaiting_approval` → executed/`failed`/rejected), but nothing *drains* this queue automatically — a human must act, or another caller must explicitly list and execute pending items |
| **Observability** | Full audit trail via `ai_action_audit` (status transitions, before/after state) — the richest audit trail of the four paths |
| **Overlap with other paths** | Writes to the **same `autopilot_actions` table as Path 2**, but with a structurally incompatible usage pattern (proper idempotency keys, richer status vocabulary, role-gated). Two different producers writing into one table with two different conventions is itself a latent correctness risk (e.g., Path 2's un-keyed inserts could collide with or be confused for Path 3's idempotency-keyed rows in any future shared consumer) |
| **Production usage** | Shares the `autopilot_actions` table with Path 2; of the 3 existing rows, some originate here (the `ai_action_audit` table — populated only by this path — also has exactly 3 rows) |
| **Migration complexity if consolidating onto this path** | Medium — this is architecturally the most mature of the four (typed actions, role gating, idempotency, audit trail) and the most natural *target* for consolidation, but its action vocabulary (CRM/HR/calendar) does not yet cover workflow automation (webhooks) or free-form conversational tool use |

### Path 4 — Conversational agents (Autopilot Agent + Smart Assistant)

| | |
|---|---|
| **Entrypoint** | `supabase/functions/autopilot-agent/index.ts` and `supabase/functions/smart-assistant/index.ts` — two separate chat-style endpoints, each with its own system prompt and its own tool list, both using the Vercel AI SDK's `streamText`/tool-calling |
| **Callers** | Two different frontend chat surfaces (the "Autopilot" chat widget and the "PA" smart-assistant widget) |
| **Side effects** | Each defines its **own** tool set inline (`buildTools()` in autopilot-agent; a `case` switch in `executeTool()` in smart-assistant) — e.g., smart-assistant alone has `send_email`, `create_task`, `create_lead`, `delete_leads`, `move_leads_to_folder`, etc., none of which are shared with Path 3's `ACTIONS` registry despite significant conceptual overlap (both have a "create a lead" action, implemented twice, independently) |
| **Auth model** | Standard `getUser()` + `profiles.company_id`, correctly scoped in both |
| **Retry model** | None — tools execute immediately as the LLM calls them, up to `stepCountIs(50)` steps in autopilot-agent (a single conversation can trigger up to 50 tool invocations with no approval gate) |
| **Queue model** | None. Immediate execution, same request/response cycle as the chat turn |
| **Observability** | None dedicated beyond generic `console.error` |
| **Overlap with other paths** | The largest actual logic duplication of the four: lead/task/customer creation is implemented a *third and fourth* time here, independently of Path 2's hardcoded executor and Path 3's typed registry |
| **Production usage** | No dedicated audit table — usage isn't currently measurable from the database the way Paths 2/3 are |
| **Migration complexity if consolidating onto this path** | High risk, not recommended as a target — no approval gate today, and *adding* one would fundamentally change the UX (a conversational agent that asks for confirmation before every tool call is a different product) |

### For comparison — `event_subscriptions` (dead schema, not a 5th path)

`event_subscriptions` (`event_pattern`, `action_type`, `action_ref`, `config`,
`is_active`) exists as a table (baseline migration, `20260812000002`) but
**has zero rows and zero readers** anywhere in the edge functions or
triggers — confirmed by grepping every function and trigger body. It appears
to be an earlier design for event-driven automation that was superseded by
the `workflows` + `workspace_events` + `enqueue_matching_workflows()` system
(Path 1) before it was ever wired up. It is not a live concern either way;
noted here only because the original audit scope named it explicitly.

## The actual overlap, concretely

- **`autopilot_actions`** is written by *both* Path 2 (no idempotency key) and
  Path 3 (real idempotency key) with incompatible conventions.
- **"Create a lead/task/customer"** is implemented independently in Path 2
  (`autopilot-execute`'s if/else), Path 3 (`ACTIONS` registry), and Path 4
  *twice* (autopilot-agent's tools and smart-assistant's tools) — four
  separate implementations of overlapping CRUD, each capable of drifting
  from the others' validation/authorization rules over time.
- **Only Path 1** has a real durable queue with retry/backoff/dead-letter.
  Paths 2–4 are all synchronous, in-request, best-effort.
- **Only Path 3** has typed field validation and per-action role
  requirements declared in one place.
- **Only Path 3** has a complete audit trail (`ai_action_audit`).

## Options

### Option A — Keep current (do nothing structural)

**Pros:** Zero migration risk. Zero regression risk to the 3 live
`autopilot_actions` rows and 24 configured workflows. No user-facing change.

**Cons:** The duplication keeps growing — every new "AI can now also do X"
feature has to decide which of 4 patterns to clone, and most will keep
cloning Path 4 (lowest ceremony) or Path 2 (already has a UI), widening the
gap with Path 3's more correct model. Bugs fixed in one path's copy of
"create a lead" (e.g., a validation or tenant-scoping fix) will not
propagate to the other 3 copies — this is itself a standing security/
correctness risk class, not just tech debt.

**Risk:** Low now, compounding later.

**Recommendation weight:** Reasonable short-term choice if there is no
near-term plan to build more AI-driven actions. Not sustainable long-term
given the duplication is already real (4 independent lead-creation code
paths today).

### Option B — Gradual consolidation onto Path 3's registry

Concretely: extend `ai-operating-manager`'s `ACTIONS` registry to be the
**single source of truth** for action definitions (typed fields, roles,
risk, rollback text). Path 2 (`autopilot-execute`) and Path 4's tool
handlers would be rewritten to look up and invoke entries from that same
registry instead of their own independent logic — UI/approval flow and
conversational framing stay as they are; only the "what does the action
actually do to the database" layer gets shared. Path 1 (workflows) keeps
its own durable-queue webhook action for now, since it's the only one with
a genuinely different execution model (async, long-delay-tolerant) that
doesn't map cleanly onto synchronous registry calls.

**Pros:** Fixes the "4 independent lead-creation implementations" problem
directly. Each path keeps its current UX. Can be done incrementally,
one action at a time, without a flag day.

**Cons:** Real engineering effort — Path 3's registry today has ~15 actions;
Path 2 and Path 4 between them implement a different, overlapping-but-not-
identical set (e.g., `delete_leads`, `move_leads_to_folder`, `add_tags_to_leads`
exist only in Path 4 today and would need new registry entries). Requires
care that moving Path 2's un-keyed execution onto a registry that expects
idempotency keys doesn't silently change dedup behavior for the 3 existing
production rows.

**Risk:** Medium. Contained if done action-by-action with the existing
3 production rows in `autopilot_actions` left untouched (new schema is
additive, not a rewrite of history).

**Recommendation weight:** This is the path I'd recommend if/when the owner
decides to act, specifically because it doesn't require picking a single
UX or throwing away the durable workflow queue — it only deduplicates the
"what actually happens to the data" layer, which is where the real
cross-path risk lives.

### Option C — Single canonical engine (collapse all 4 into one)

Concretely: pick one execution model (most likely Path 3's
propose → approve → execute, since it's the only one with role gating +
audit trail) and route Path 1's webhook action, Path 2's brief/execute UI,
and Path 4's conversational tools all through it — including giving
Path 1 a synchronous fast-path for webhooks (defeating some of its queue
durability) or giving Path 3 an async queue (rebuilding what Path 1 already
has).

**Pros:** Eventually the cleanest end state — one registry, one audit
trail, one approval model, one place to add rate limits/quotas/permissions.

**Cons:** This is a genuine rewrite, not a refactor. It touches 4 live
frontend surfaces (Daily Brief, Operating Manager, Autopilot Agent chat,
Smart Assistant chat), the only durable queue the product has (Path 1,
currently 0 production runs but presumably intended to matter), and would
require a real decision about whether conversational tool-calling
(Path 4) should gain an approval gate — which changes that product's UX,
not just its internals. Highest risk of regressing the one path
(workflows) that currently has correct retry/dead-letter semantics if the
queue model gets simplified away in the collapse.

**Risk:** High. Not something to do opportunistically alongside other audit
work; would need its own dedicated planning and rollout, ideally after
Path 1 (workflows) has real production traffic to validate against first
(today: 0 runs).

**Recommendation weight:** Right end state *if* the product's AI-action
surface keeps growing, but premature today — Path 1 has zero production
validation yet, and collapsing onto a single engine before any path has
proven itself under real load is the likeliest way to introduce a new
production incident rather than prevent one.

## What this document deliberately does not do

- It does not choose A, B, or C.
- It does not touch `workflowActionRegistry.ts`, `ai-operating-manager`'s
  `ACTIONS`, `autopilot-execute`'s if/else chain, or either conversational
  agent's tool list.
- It does not drop or modify `event_subscriptions` (dead schema, left as-is;
  a separate, low-risk cleanup if the owner wants it, not bundled here).

Everything above was derived from reading the live code and querying the
live database (row counts as of this audit) — not from assumptions about
intended design.
