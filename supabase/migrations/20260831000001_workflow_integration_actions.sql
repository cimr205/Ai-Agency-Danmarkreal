-- Lets a workflow's action step run a real tool through a connected
-- integration (via the Capability Engine + execute-tool), not just fire a
-- webhook. Additive only: existing webhook workflows are unaffected,
-- action_type keeps its current values plus the new "run_integration".
alter table public.workflows
  add column if not exists action_capability text,
  add column if not exists action_tool_slug text,
  add column if not exists action_arguments jsonb not null default '{}'::jsonb;

comment on column public.workflows.action_capability is
  'Capability the action needs (e.g. documents.write, messaging.send) — resolved to a connected integration server-side, same engine product pages use.';
comment on column public.workflows.action_tool_slug is
  'Composio tool slug to execute when action_type = run_integration (e.g. NOTION_CREATE_PAGE).';
comment on column public.workflows.action_arguments is
  'Argument template for the tool call. String values may contain {{field}} placeholders resolved from the trigger payload at run time.';
