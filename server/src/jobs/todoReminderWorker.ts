import { createNotification } from '../repositories/notificationRepository';
import { readStore } from '../db';

const REMINDER_THRESHOLD_MS = 1000 * 60 * 60 * 48;

export function startTodoReminderWorker(intervalMs = 60000) {
  const run = () => {
    const store = readStore();
    const now = Date.now();
    store.todos.forEach((todo) => {
      if (todo.status !== 'open') return;
      if (!todo.createdAt) return;
      const age = now - new Date(todo.createdAt).getTime();
      if (age < REMINDER_THRESHOLD_MS) return;
      if (!todo.companyId) return;
      createNotification({
        companyId: todo.companyId,
        userId: todo.ownerUserId,
        title: 'Todo reminder',
        body: todo.title,
      });
    });
  };

  run();
  const handle = setInterval(run, intervalMs);
  return () => clearInterval(handle);
}

