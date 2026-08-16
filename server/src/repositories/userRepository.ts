import { readStore, updateStore } from '../db';
import { upsertUser } from '../services/postgresUsers';

export interface UserRecord {
  id: string;
  name?: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt?: string;
  role: 'admin' | 'user';
  companyId?: string;
  createdAt: string;
}

export function findUserByEmail(email: string): UserRecord | null {
  const store = readStore();
  const user = store.users.find((item) => item.email === email);
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    passwordHash: user.passwordHash,
    emailVerifiedAt: user.emailVerifiedAt,
    role: user.role || 'user',
    companyId: user.companyId,
    createdAt: user.createdAt,
  };
}

export function findUserById(id: string): UserRecord | null {
  const store = readStore();
  const user = store.users.find((item) => item.id === id);
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    passwordHash: user.passwordHash,
    emailVerifiedAt: user.emailVerifiedAt,
    role: user.role || 'user',
    companyId: user.companyId,
    createdAt: user.createdAt,
  };
}

export function createUser(input: {
  id: string;
  name?: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user';
  companyId?: string;
  emailVerifiedAt?: string;
}) {
  const createdAt = new Date().toISOString();
  updateStore((store) => {
    store.users.push({
      id: input.id,
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      role: input.role,
      companyId: input.companyId,
      emailVerifiedAt: input.emailVerifiedAt,
      createdAt,
    });
  });
  void upsertUser({ ...input, createdAt });
  return { ...input, createdAt };
}

export function updateUser(id: string, updates: Partial<UserRecord>) {
  const updated = updateStore((store) => {
    const user = store.users.find((item) => item.id === id);
    if (!user) return null;
    if (updates.name !== undefined) user.name = updates.name;
    if (updates.email !== undefined) user.email = updates.email;
    if (updates.passwordHash !== undefined) user.passwordHash = updates.passwordHash;
    if (updates.emailVerifiedAt !== undefined) user.emailVerifiedAt = updates.emailVerifiedAt;
    if (updates.role !== undefined) user.role = updates.role;
    if (updates.companyId !== undefined) user.companyId = updates.companyId;
    return { ...user };
  });
  if (updated) {
    void upsertUser(updated);
  }
}

export function markUserEmailVerified(userId: string) {
  const verifiedAt = new Date().toISOString();
  const updated = updateStore((store) => {
    const user = store.users.find((item) => item.id === userId);
    if (user) {
      user.emailVerifiedAt = verifiedAt;
      return { ...user };
    }
    return null;
  });
  if (updated) {
    void upsertUser(updated);
  }
  return verifiedAt;
}

export function findCompanyDefaultOwner(companyId: string) {
  const store = readStore();
  const admin = store.users.find((item) => item.companyId === companyId && item.role === 'admin');
  if (admin) return admin.id;
  const anyUser = store.users.find((item) => item.companyId === companyId);
  return anyUser?.id || null;
}

