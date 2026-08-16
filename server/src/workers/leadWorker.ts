import { listActiveSearchJobs, updateSearchJob } from '../repositories/searchJobRepository';
import { runLeadSearchJob } from '../services/leadRunner';

const DEFAULT_INTERVAL_MS = 1000 * 60 * 5;

function computeNextRun(now: Date, minutes: number) {
  return new Date(now.getTime() + minutes * 60 * 1000).toISOString();
}

export function startLeadWorker() {
  const tick = async () => {
    const jobs = listActiveSearchJobs();
    const now = new Date();
    for (const job of jobs) {
      if (job.nextRunAt && new Date(job.nextRunAt) > now) continue;
      const result = await runLeadSearchJob({
        jobId: job.id,
        userId: job.userId,
        provider: job.provider,
        query: job.query,
      });
      const backoffMinutes = result.rateLimited ? 30 : 10;
      updateSearchJob(job.id, {
        lastRunAt: now.toISOString(),
        nextRunAt: computeNextRun(now, backoffMinutes),
      });
    }
  };

  tick().catch(() => undefined);
  const handle = setInterval(() => {
    tick().catch(() => undefined);
  }, DEFAULT_INTERVAL_MS);

  return () => clearInterval(handle);
}

