import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreData } from '../db';
import { DealStageId } from '../domain/deals';

export interface DealRecord {
  id: string;
  ownerUserId: string;
  title: string;
  value: number;
  stageId: DealStageId;
  stageEnteredAt: string;
  employeeId?: string;
  leadId?: string;
  customerId?: string;
  createdAt: string;
  updatedAt: string;
}

export function createDeal(input: {
  ownerUserId: string;
  title: string;
  value: number;
  stageId: DealStageId;
  employeeId?: string;
  leadId?: string;
  customerId?: string;
}) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const updatedAt = createdAt;
  const stageEnteredAt = createdAt;
  updateStore((store: StoreData) => {
    store.deals.push({
      id,
      ownerUserId: input.ownerUserId,
      title: input.title,
      value: input.value,
      stageId: input.stageId,
      stageEnteredAt,
      employeeId: input.employeeId,
      leadId: input.leadId,
      customerId: input.customerId,
      createdAt,
      updatedAt,
    });
  });
  return {
    id,
    ownerUserId: input.ownerUserId,
    title: input.title,
    value: input.value,
    stageId: input.stageId,
    stageEnteredAt,
    employeeId: input.employeeId,
    leadId: input.leadId,
    customerId: input.customerId,
    createdAt,
    updatedAt,
  };
}

export function listDealsByOwner(ownerUserId: string) {
  const store: StoreData = readStore();
  return store.deals
    .filter((row) => row.ownerUserId === ownerUserId)
    .map((row) => ({
      id: row.id,
      ownerUserId: row.ownerUserId,
      title: row.title,
      value: row.value,
      stageId: row.stageId as DealStageId,
      stageEnteredAt: row.stageEnteredAt,
      employeeId: row.employeeId,
      leadId: row.leadId,
      customerId: row.customerId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
}

export function updateDealStage(input: { id: string; stageId: DealStageId }) {
  const stageEnteredAt = new Date().toISOString();
  const updatedAt = stageEnteredAt;
  updateStore((store: StoreData) => {
    const deal = store.deals.find((item) => item.id === input.id);
    if (deal) {
      deal.stageId = input.stageId;
      deal.stageEnteredAt = stageEnteredAt;
      deal.updatedAt = updatedAt;
    }
  });
  return { stageEnteredAt, updatedAt };
}

export function summarizePipeline(ownerUserId: string) {
  const store: StoreData = readStore();
  const summary = new Map<DealStageId, { count: number; totalValue: number }>();
  for (const deal of store.deals.filter((item) => item.ownerUserId === ownerUserId)) {
    const current = summary.get(deal.stageId as DealStageId) || { count: 0, totalValue: 0 };
    current.count += 1;
    current.totalValue += deal.value;
    summary.set(deal.stageId as DealStageId, current);
  }
  return Array.from(summary.entries()).map(([stageId, row]) => ({
    stageId,
    count: row.count,
    totalValue: row.totalValue,
  }));
}

