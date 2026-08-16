import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreClowdBotSearchRun } from '../db';

export function createClowdBotSearchRun(input: {
  jobId: string;
  companyId: string;
  status: StoreClowdBotSearchRun['status'];
  startedAt: string;
}) {
  const record: StoreClowdBotSearchRun = {
    id: randomUUID(),
    jobId: input.jobId,
    companyId: input.companyId,
    status: input.status,
    startedAt: input.startedAt,
  };
  updateStore((store) => {
    store.clowdBotSearchRuns.push(record);
  });
  return record;
}

export function finishClowdBotSearchRun(input: {
  runId: string;
  status: StoreClowdBotSearchRun['status'];
  finishedAt: string;
  leadCount?: number;
  error?: string;
}) {
  updateStore((store) => {
    const run = store.clowdBotSearchRuns.find((item) => item.id === input.runId);
    if (!run) return;
    run.status = input.status;
    run.finishedAt = input.finishedAt;
    run.leadCount = input.leadCount;
    run.error = input.error;
  });
}

export function listClowdBotSearchRuns(companyId: string, jobId?: string) {
  const store = readStore();
  return store.clowdBotSearchRuns.filter(
    (run) => run.companyId === companyId && (!jobId || run.jobId === jobId)
  );
}

