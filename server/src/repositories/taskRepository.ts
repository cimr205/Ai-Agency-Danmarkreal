import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreData } from '../db';
import { Task, TaskRepository } from '../domain/tasks';

export class TaskRepositorySqlite implements TaskRepository {
  async findById(id: string): Promise<Task | null> {
    const store: StoreData = readStore();
    const row = store.tasks.find((item) => item.id === id);
    if (!row) return null;
    return {
      id: row.id,
      type: row.type as Task['type'],
      title: row.title,
      status: row.status as Task['status'],
      dueAt: row.dueAt,
      ownerUserId: row.ownerUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
      related: {
        leadId: row.leadId,
        customerId: row.customerId,
        dealId: row.dealId,
      },
    };
  }

  async findOpenByOwner(ownerUserId: string): Promise<Task[]> {
    return this.listByOwner(ownerUserId, 'open');
  }

  async listByOwner(ownerUserId: string, status?: Task['status']): Promise<Task[]> {
    const store: StoreData = readStore();
    const rows = store.tasks.filter((row) =>
      row.ownerUserId === ownerUserId && (!status || row.status === status)
    );
    return rows.map((row) => ({
      id: row.id,
      type: row.type as Task['type'],
      title: row.title,
      status: row.status as Task['status'],
      dueAt: row.dueAt,
      ownerUserId: row.ownerUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      completedAt: row.completedAt,
      related: {
        leadId: row.leadId,
        customerId: row.customerId,
        dealId: row.dealId,
      },
    }));
  }

  async create(input: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;
    updateStore((store: StoreData) => {
      store.tasks.push({
        id,
        ownerUserId: input.ownerUserId,
        type: input.type,
        title: input.title,
        status: input.status,
        dueAt: input.dueAt,
        completedAt: input.completedAt,
        leadId: input.related.leadId,
        customerId: input.related.customerId,
        dealId: input.related.dealId,
        createdAt,
        updatedAt,
      });
    });
    return {
      ...input,
      id,
      createdAt,
      updatedAt,
    };
  }

  async update(id: string, updates: Partial<Task>): Promise<Task> {
    const existing = await this.findById(id);
    if (!existing) {
      throw new Error('Task not found');
    }
    const merged = { ...existing, ...updates };
    updateStore((store: StoreData) => {
      const task = store.tasks.find((item) => item.id === id);
      if (!task) return;
      task.type = merged.type;
      task.title = merged.title;
      task.status = merged.status;
      task.dueAt = merged.dueAt;
      task.completedAt = merged.completedAt;
      task.leadId = merged.related.leadId;
      task.customerId = merged.related.customerId;
      task.dealId = merged.related.dealId;
      task.updatedAt = new Date().toISOString();
    });
    return merged;
  }
}

