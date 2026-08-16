import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import { readStore, updateStore } from './db';

export interface AuthUser {
  id: string;
  name?: string;
  email: string;
  emailVerifiedAt?: string;
  role: 'admin' | 'user';
  companyId?: string;
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function createSession(userId: string) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  updateStore((store) => {
    store.sessions.push({ id, userId, createdAt, expiresAt });
  });
  return { id, createdAt, expiresAt };
}

export function getUserFromSession(token: string): AuthUser | null {
  const store = readStore();
  const session = store.sessions.find(
    (item) => item.id === token && item.expiresAt > new Date().toISOString()
  );
  if (!session) return null;
  const user = store.users.find((item) => item.id === session.userId);
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt || undefined,
    role: user.role || 'user',
    companyId: user.companyId,
  };
}

