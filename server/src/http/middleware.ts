import { getUserFromSession } from '../auth';

export interface AuthedRequest {
  body?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  user?: {
    id: string;
    name?: string;
    email: string;
    emailVerifiedAt?: string;
    role: 'admin' | 'user';
    companyId?: string;
  };
}

export function requireAuth(req: AuthedRequest, res: { status: (code: number) => { json: (payload: unknown) => void } }) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  const token = typeof authHeader === 'string' ? authHeader.replace('Bearer ', '') : '';
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  const user = getUserFromSession(token);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  req.user = user;
  return user;
}

export function requireAdmin(
  req: AuthedRequest,
  res: { status: (code: number) => { json: (payload: unknown) => void } }
) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return user;
}

