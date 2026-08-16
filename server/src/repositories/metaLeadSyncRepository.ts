import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreMetaLeadSyncState } from '../db';

export function upsertMetaLeadSyncState(input: {
  companyId: string;
  formId: string;
  lastLeadgenId?: string;
}) {
  const now = new Date().toISOString();
  let record: StoreMetaLeadSyncState | undefined;
  updateStore((store) => {
    record = store.metaLeadSyncStates.find(
      (item) => item.companyId === input.companyId && item.formId === input.formId
    );
    if (record) {
      record.lastLeadgenId = input.lastLeadgenId || record.lastLeadgenId;
      record.lastSyncAt = now;
    } else {
      store.metaLeadSyncStates.push({
        id: randomUUID(),
        companyId: input.companyId,
        formId: input.formId,
        lastLeadgenId: input.lastLeadgenId,
        lastSyncAt: now,
      });
    }
  });
  return record || null;
}

export function getMetaLeadSyncState(companyId: string, formId: string) {
  const store = readStore();
  return store.metaLeadSyncStates.find((item) => item.companyId === companyId && item.formId === formId) || null;
}

