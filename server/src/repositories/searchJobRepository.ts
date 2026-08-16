import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreSearchJob } from '../db';

export function createSearchJob(input: {
  userId: string;
  provider: string;
  query: string;
  status: 'active' | 'paused';
}) {
  const now = new Date().toISOString();
  const record: StoreSearchJob = {
    id: randomUUID(),
    userId: input.userId,
    provider: input.provider,
    query: input.query,
    status: input.status,
    createdAt: now,
    updatedAt: now,
  };
  updateStore((store) => {
    store.searchJobs.push(record);
  });
  return record;
}

export function listSearchJobs(userId: string) {
  const store = readStore();
  return store.searchJobs.filter((job) => job.userId === userId);
}

export function listActiveSearchJobs() {
  const store = readStore();
  return store.searchJobs.filter((job) => job.status === 'active');
}

export function updateSearchJob(id: string, updates: Partial<StoreSearchJob>) {
  let updated: StoreSearchJob | null = null;
  updateStore((store) => {
    const job = store.searchJobs.find((item) => item.id === id);
    if (!job) return;
    Object.assign(job, updates, { updatedAt: new Date().toISOString() });
    updated = job;
  });
  return updated;
}

