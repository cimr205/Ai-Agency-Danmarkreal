import { TaskRepository, TaskStatus, TaskType } from '../../domain/tasks';

export class TaskService {
  constructor(private readonly tasks: TaskRepository) {}

  async createTask(input: {
    type: TaskType;
    title: string;
    dueAt: string;
    ownerUserId: string;
    related: { leadId?: string; customerId?: string; dealId?: string };
  }) {
    return this.tasks.create({
      type: input.type,
      title: input.title,
      status: 'open',
      dueAt: input.dueAt,
      ownerUserId: input.ownerUserId,
      related: input.related,
    });
  }

  async markStatus(taskId: string, status: TaskStatus) {
    return this.tasks.update(taskId, {
      status,
      updatedAt: new Date().toISOString(),
      completedAt: status === 'done' ? new Date().toISOString() : undefined,
    });
  }
}

