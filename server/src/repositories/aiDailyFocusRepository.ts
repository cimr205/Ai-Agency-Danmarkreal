import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreAiDailyFocus } from '../db';

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function listDailyFocus(companyId: string, date = getTodayKey()) {
  const store = readStore();
  return store.aiDailyFocus.filter((item) => item.companyId === companyId && item.date === date);
}

export function getLatestDailyFocus(companyId: string, date = getTodayKey()) {
  const items = listDailyFocus(companyId, date);
  return items.length ? items[items.length - 1] : null;
}

export function createDailyFocus(input: {
  companyId: string;
  date: string;
  json: Array<Record<string, unknown>>;
}) {
  const record: StoreAiDailyFocus = {
    id: randomUUID(),
    companyId: input.companyId,
    date: input.date,
    json: input.json,
    createdAt: new Date().toISOString(),
  };
  updateStore((store) => {
    store.aiDailyFocus.push(record);
  });
  return record;
}

export function canRefreshDailyFocus(companyId: string, date = getTodayKey(), limit = 2) {
  return listDailyFocus(companyId, date).length < limit;
}
