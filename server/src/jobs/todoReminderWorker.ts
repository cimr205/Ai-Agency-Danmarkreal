import { supabaseAdmin } from '../core/supabase';

// Rewritten against real Supabase `tasks`/`notifications` — the original
// version reminded about `store.todos` in the legacy local-JSON datastore
// (server/src/db.ts). That "Todos" feature was itself dead (superseded by
// the real Tasks feature, its page/hooks removed as unreachable dead code).
// Repurposed here to do the equivalent job for the feature that's actually
// live: nudge about tasks that have sat open for 48h+ with no due date yet
// (tasks *with* a due date are covered by deadlineWorker once overdue).

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
  created_at: string;
}

const REMINDER_THRESHOLD_MS = 1000 * 60 * 60 * 48;

export function startTodoReminderWorker(intervalMs = 60000) {
  const run = async () => {
    const cutoff = new Date(Date.now() - REMINDER_THRESHOLD_MS).toISOString();
    const { data: stale, error } = (await db
      .from('tasks')
      .select('id, company_id, title, assigned_to, created_by, created_at')
      .eq('status', 'pending')
      .is('due_date', null)
      .lt('created_at', cutoff)) as { data: TaskRow[] | null; error: { message: string } | null };
    if (error) {
      console.error('[todoReminderWorker] failed to load stale tasks:', error.message);
      return;
    }

    for (const task of stale ?? []) {
      const userId = task.assigned_to ?? task.created_by;
      if (!userId) continue;
      const link = `/app/work/tasks?task=${task.id}`;

      const { data: existing } = (await db
        .from('notifications')
        .select('id')
        .eq('link', link)
        .eq('type', 'task_stale')
        .maybeSingle()) as { data: { id: string } | null };
      if (existing) continue;

      const { error: insertError } = await db.from('notifications').insert({
        company_id: task.company_id,
        user_id: userId,
        type: 'task_stale',
        title: 'Opgave uden dato har ligget åben i 48 timer',
        message: task.title,
        link,
      });
      if (insertError) console.error('[todoReminderWorker] failed to notify:', insertError.message);
    }
  };

  run().catch((e) => console.error('[todoReminderWorker] tick failed:', e));
  const handle = setInterval(() => {
    run().catch((e) => console.error('[todoReminderWorker] tick failed:', e));
  }, intervalMs);
  return () => clearInterval(handle);
}
