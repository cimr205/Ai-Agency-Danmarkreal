import { readStore, updateStore } from '../db';

export function startDeadlineWorker(intervalMs = 60000) {
  const run = () => {
    const now = new Date();
    updateStore((store) => {
      store.tasks.forEach((task) => {
        if (task.status === 'open' && task.dueAt && new Date(task.dueAt) < now) {
          task.status = 'overdue';
          task.updatedAt = new Date().toISOString();
        }
      });
    });
  };

  run();
  const handle = setInterval(run, intervalMs);
  return () => clearInterval(handle);
}

