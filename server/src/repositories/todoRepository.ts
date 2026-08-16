import { readStore, updateStore } from '../db';

export interface TodoRecord {
  id: string;
  ownerUserId: string;
  companyId?: string;
  title: string;
  description?: string;
  status: 'open' | 'done' | 'overdue';
  priorityBucket?: 'now' | 'next' | 'later';
  assignedUserId?: string;
  department?: string;
  source?: string;
  visibilityScope?: 'personal' | 'company';
  actionType?: string;
  recommendedAction?: string;
  actionAlternatives?: string[];
  actionState?: string;
  actionMeta?: Record<string, unknown>;
  dueAt?: string;
  rationale?: string;
  createdAt: string;
  updatedAt: string;
}

export function createTodo(input: Omit<TodoRecord, 'createdAt' | 'updatedAt' | 'status'> & { status?: TodoRecord['status'] }) {
  const createdAt = new Date().toISOString();
  const updatedAt = createdAt;
  const record: TodoRecord = {
    ...input,
    status: input.status || 'open',
    createdAt,
    updatedAt,
  };
  updateStore((store) => {
    store.todos.push(record);
  });
  return record;
}

export function listTodosByOwner(ownerUserId: string) {
  const store = readStore();
  return store.todos.filter((row) => row.ownerUserId === ownerUserId);
}

export function listCompanyTodos(companyId: string) {
  const store = readStore();
  return store.todos.filter((row) => row.companyId === companyId);
}

export function updateTodoStatus(
  id: string,
  updates: { status: TodoRecord['status']; actionState?: string; actionMeta?: Record<string, unknown> }
) {
  const updatedAt = new Date().toISOString();
  let updated: TodoRecord | null = null;
  updateStore((store) => {
    const todo = store.todos.find((row) => row.id === id);
    if (!todo) return;
    todo.status = updates.status;
    if (updates.actionState !== undefined) {
      todo.actionState = updates.actionState;
    }
    if (updates.actionMeta !== undefined) {
      todo.actionMeta = updates.actionMeta;
    }
    todo.updatedAt = updatedAt;
    updated = { ...todo };
  });
  return updated;
}

export function updateTodoFields(
  id: string,
  updates: Partial<Omit<TodoRecord, 'id' | 'ownerUserId' | 'createdAt'>>
) {
  const updatedAt = new Date().toISOString();
  let updated: TodoRecord | null = null;
  updateStore((store) => {
    const todo = store.todos.find((row) => row.id === id);
    if (!todo) return;
    Object.assign(todo, updates, { updatedAt });
    updated = { ...todo };
  });
  return updated;
}

