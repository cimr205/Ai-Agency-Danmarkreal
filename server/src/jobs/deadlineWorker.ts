import { supabaseAdmin } from '../core/supabase';

// server/ has no generated Supabase Database type (that only exists in the
// frontend build), so a plain `.from('tasks')` infers `never` for row
// shapes. `db` is the same client with that constraint dropped; call sites
// below type their own results explicitly instead.
const db = supabaseAdmin as unknown as { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any

interface TaskRow {
  id: string;
  company_id: string;
  title: string;
  assigned_to: string | null;
  created_by: string;
  due_date: string | null;
}

// Rewritten against the real Supabase `tasks`/`notifications` tables — the
// original version mutated a `store.tasks` array in the legacy local-JSON
// datastore (server/src/db.ts), which the live app never reads or writes.
// `task_status` has no 'overdue' value (pending|in_progress|completed), so
// this notifies instead of trying to set a status that can't exist.
// Dedup: skip a task if we already sent an overdue notification linking to
// it, so a 60s tick doesn't spam the same task every run.

export function startDeadlineWorker(intervalMs = 60000) {
  const run = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: overdue, error } = (await db
      .from('tasks')
      .select('id, company_id, title, assigned_to, created_by, due_date')
      .eq('status', 'pending')
      .lt('due_date', today)) as { data: TaskRow[] | null; error: { message: string } | null };
    if (error) {
      console.error('[deadlineWorker] failed to load overdue tasks:', error.message);
      return;
    }

    for (const task of overdue ?? []) {
      const userId = task.assigned_to ?? task.created_by;
      if (!userId) continue;
      const link = `/app/work/tasks?task=${task.id}`;

      const { data: existing } = (await db
        .from('notifications')
        .select('id')
        .eq('link', link)
        .eq('type', 'task_overdue')
        .maybeSingle()) as { data: { id: string } | null };
      if (existing) continue;

      const { error: insertError } = await db.from('notifications').insert({
        company_id: task.company_id,
        user_id: userId,
        type: 'task_overdue',
        title: 'Opgave overskredet frist',
        message: task.title,
        link,
      });
      if (insertError) console.error('[deadlineWorker] failed to notify:', insertError.message);
    }
  };

  run().catch((e) => console.error('[deadlineWorker] tick failed:', e));
  const handle = setInterval(() => {
    run().catch((e) => console.error('[deadlineWorker] tick failed:', e));
  }, intervalMs);
  return () => clearInterval(handle);
}
