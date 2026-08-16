import { metaConfig } from '../config';
import { readStore } from '../../db';

export function canChangeEntity(companyId: string, entityType: 'campaign' | 'adset' | 'ad', entityId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const store = readStore();
  return !store.metaEntityChanges.some(
    (row) =>
      row.companyId === companyId &&
      row.entityType === entityType &&
      row.entityId === entityId &&
      row.createdAt.slice(0, 10) === today
  );
}

export function isSpendLimitExceeded(spend: number) {
  if (metaConfig.dailySpendLimit && spend > metaConfig.dailySpendLimit) return true;
  return false;
}

