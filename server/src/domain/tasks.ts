export type TaskStatus = 'open' | 'done' | 'overdue';
export type TaskType = 'Svar på tilbud' | 'Følg op' | 'Ring tilbage' | 'Send kontrakt';

export interface Task {
  id: string;
  type: TaskType;
  title: string;
  status: TaskStatus;
  dueAt: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  related: {
    leadId?: string;
    customerId?: string;
    dealId?: string;
  };
}

export interface TaskRepository {
  findById(id: string): Promise<Task | null>;
  findOpenByOwner(ownerUserId: string): Promise<Task[]>;
  listByOwner(ownerUserId: string, status?: TaskStatus): Promise<Task[]>;
  create(input: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task>;
  update(id: string, updates: Partial<Task>): Promise<Task>;
}

