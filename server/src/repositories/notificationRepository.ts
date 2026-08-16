import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreData, StoreNotification } from '../db';

export function createNotification(input: {
  companyId: string;
  userId: string;
  title: string;
  body: string;
}) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const notification: StoreNotification = {
    id,
    companyId: input.companyId,
    userId: input.userId,
    title: input.title,
    body: input.body,
    createdAt,
  };
  updateStore((store: StoreData) => {
    store.notifications.push(notification);
  });
  return notification;
}

export function listNotificationsForUser(companyId: string, userId: string) {
  const store: StoreData = readStore();
  return store.notifications.filter(
    (note) => note.companyId === companyId && note.userId === userId
  );
}

export function markNotificationRead(notificationId: string, userId: string) {
  updateStore((store: StoreData) => {
    const note = store.notifications.find(
      (item) => item.id === notificationId && item.userId === userId
    );
    if (note) {
      note.readAt = new Date().toISOString();
    }
  });
}

