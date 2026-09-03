-- Additive: lets the Tasks UI hide old/irrelevant tasks without deleting
-- them, and stop the default view from being dominated by completed tasks
-- (masterprompt requirement). Orthogonal to task_status — a completed OR
-- cancelled task can be archived independently of its status.
alter table public.tasks add column archived boolean not null default false;

create index tasks_company_archived_idx on public.tasks (company_id, archived, due_date);
create index tasks_assigned_to_idx on public.tasks (assigned_to);
