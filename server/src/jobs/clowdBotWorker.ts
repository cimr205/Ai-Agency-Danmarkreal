import { readStore } from '../db';
import { canRunJob, deliverClowdBotJob, getDeliveryStatus, runClowdBotJob } from '../services/clowdbot/clowdBotService';

const DEFAULT_INTERVAL_MS = 1000 * 60 * 15;

export function startClowdBotWorker() {
  const tick = async () => {
    const store = readStore();
    const jobs = store.clowdBotSearchJobs.filter((job) => job.status === 'active');
    for (const job of jobs) {
      const now = new Date();
      const delivery = getDeliveryStatus(job, now);
      const shouldRun = canRunJob(job, now) || delivery.shouldDeliver;
      if (!shouldRun) continue;
      const created = await runClowdBotJob(job);
      if (delivery.shouldDeliver) {
        await deliverClowdBotJob(job, created, delivery.dateKey);
      }
    }
  };

  tick().catch(() => undefined);
  const handle = setInterval(() => {
    tick().catch(() => undefined);
  }, DEFAULT_INTERVAL_MS);

  return () => clearInterval(handle);
}

