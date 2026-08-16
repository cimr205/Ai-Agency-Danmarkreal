import { readStore, updateStore } from '../db';
import { Activity, ActivityRepository } from '../domain/activities';

export class ActivityRepositorySqlite implements ActivityRepository {
  async findById(id: string): Promise<Activity | null> {
    const store = readStore();
    const row = store.activities.find((item) => item.id === id);
    if (!row) return null;
    return {
      id: row.id,
      ownerUserId: row.ownerUserId,
      type: row.type as Activity['type'],
      summary: row.summary,
      direction: row.direction as Activity['direction'],
      subject: row.subject,
      messageId: row.messageId,
      createdAt: row.createdAt,
      related: {
        leadId: row.leadId,
        customerId: row.customerId,
        dealId: row.dealId,
      },
    };
  }

  async create(input: Activity): Promise<Activity> {
    updateStore((store) => {
      store.activities.push({
        id: input.id,
        ownerUserId: input.ownerUserId,
        leadId: input.related.leadId,
        customerId: input.related.customerId,
        dealId: input.related.dealId,
        type: input.type,
        direction: input.direction,
        summary: input.summary,
        subject: input.subject,
        messageId: input.messageId,
        createdAt: input.createdAt,
      });
    });
    return input;
  }
}

