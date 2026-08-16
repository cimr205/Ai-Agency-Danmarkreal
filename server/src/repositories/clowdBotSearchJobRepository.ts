import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreClowdBotSearchJob } from '../db';

export type ClowdBotSearchJobRecord = StoreClowdBotSearchJob;

export function createClowdBotSearchJob(input: Omit<StoreClowdBotSearchJob, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  const record: StoreClowdBotSearchJob = {
    ...input,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  updateStore((store) => {
    store.clowdBotSearchJobs.push(record);
  });
  return record;
}

export function listClowdBotSearchJobs(companyId: string) {
  const store = readStore();
  return store.clowdBotSearchJobs.filter((job) => job.companyId === companyId);
}

export function findClowdBotSearchJob(companyId: string, jobId: string) {
  const store = readStore();
  return store.clowdBotSearchJobs.find((job) => job.companyId === companyId && job.id === jobId) || null;
}

export function updateClowdBotSearchJob(
  companyId: string,
  jobId: string,
  updates: Partial<Omit<StoreClowdBotSearchJob, 'id' | 'companyId' | 'createdAt'>>
) {
  let updated: StoreClowdBotSearchJob | null = null;
  updateStore((store) => {
    const job = store.clowdBotSearchJobs.find((item) => item.companyId === companyId && item.id === jobId);
    if (!job) return;
    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    updated = job;
  });
  return updated;
}

export function recordClowdBotJobRun(companyId: string, jobId: string, updates: Partial<StoreClowdBotSearchJob>) {
  return updateClowdBotSearchJob(companyId, jobId, updates);
}

