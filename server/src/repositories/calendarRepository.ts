import { randomUUID } from 'crypto';
import { readStore, updateStore } from '../db';
import type { StoreCalendarEvent, StoreData } from '../db';

export function createCalendarEvent(input: {
  companyId: string;
  ownerUserId: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  participantUserIds: string[];
}) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const event: StoreCalendarEvent = {
    id,
    companyId: input.companyId,
    ownerUserId: input.ownerUserId,
    title: input.title,
    description: input.description,
    startAt: input.startAt,
    endAt: input.endAt,
    participantUserIds: input.participantUserIds,
    createdAt,
  };
  updateStore((store: StoreData) => {
    store.calendarEvents.push(event);
  });
  return event;
}

export function listCalendarEventsForCompany(companyId: string) {
  const store: StoreData = readStore();
  return store.calendarEvents.filter((event) => event.companyId === companyId);
}

export function listCalendarEventsForUser(companyId: string, userId: string) {
  const store: StoreData = readStore();
  return store.calendarEvents.filter(
    (event) =>
      event.companyId === companyId &&
      (event.ownerUserId === userId || event.participantUserIds.includes(userId))
  );
}

