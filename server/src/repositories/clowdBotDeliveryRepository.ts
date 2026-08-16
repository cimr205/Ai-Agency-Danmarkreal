import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreClowdBotDelivery } from '../db';

export function createClowdBotDelivery(input: {
  jobId: string;
  companyId: string;
  dateKey: string;
  leadCount: number;
}) {
  const record: StoreClowdBotDelivery = {
    id: randomUUID(),
    jobId: input.jobId,
    companyId: input.companyId,
    dateKey: input.dateKey,
    leadCount: input.leadCount,
    createdAt: new Date().toISOString(),
  };
  updateStore((store) => {
    store.clowdBotDeliveries.push(record);
  });
  return record;
}

export function listClowdBotDeliveries(companyId: string, jobId?: string) {
  const store = readStore();
  return store.clowdBotDeliveries.filter(
    (delivery) => delivery.companyId === companyId && (!jobId || delivery.jobId === jobId)
  );
}

