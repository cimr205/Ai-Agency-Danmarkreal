import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../config/env';
import { query } from './database';
import { fail } from './http';
import { ServiceUnavailableError, isServiceUnavailableError } from './serviceUnavailable';

export type AuthUser = {
  id: string;
  email: string;
  fullName: string | null;
  companyId: string | null;
  companyName: string | null;
  companyIsActive: boolean | null;
  role: string | null;
  isGlobalAdmin: boolean;
  permissions: string[];
  onboardingCompleted: boolean;
};

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

if (env.supabaseUrl) {
  try {
    const base = env.supabaseUrl.endsWith('/') ? env.supabaseUrl.slice(0, -1) : env.supabaseUrl;
    jwks = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
     
    console.log(`Invalid SUPABASE_URL for JWKS setup: ${message}`);
    jwks = null;
  }
}

async function verifySupabaseToken(token: string) {
  if (!jwks || !env.supabaseJwtIssuer) {
    throw new ServiceUnavailableError('Supabase JWT configuration is missing.');
  }
  const { payload } = await jwtVerify(token, jwks, {
    issuer: env.supabaseJwtIssuer,
    audience: 'authenticated',
  });
  if (!payload.sub) {
    throw new Error('Invalid token payload');
  }
  return payload.sub;
}

async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const rows = await query<{
    id: string;
    email: string;
    full_name: string | null;
    company_id: string | null;
    company_name: string | null;
    company_is_active: boolean | null;
    role: string | null;
    is_global_admin: boolean;
    permissions: string[] | null;
    onboarding_completed: boolean;
  }>(
    `
    select
      u.id,
      u.email,
      u.full_name,
      u.company_id,
      c.name as company_name,
      c.is_active as company_is_active,
      u.role,
      u.is_global_admin,
      u.onboarding_completed,
      coalesce(array_agg(rp.permission) filter (where rp.permission is not null), '{}') as permissions
    from users u
    left join companies c on c.id = u.company_id
    left join role_permissions rp on rp.role_slug = u.role
    where u.id = $1
    group by u.id, c.name, c.is_active
    `,
    [userId]
  );

  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    email: rows[0].email,
    fullName: rows[0].full_name,
    companyId: rows[0].company_id,
    companyName: rows[0].company_name,
    companyIsActive: rows[0].company_is_active,
    role: rows[0].role,
    isGlobalAdmin: rows[0].is_global_admin,
    permissions: rows[0].permissions || [],
    onboardingCompleted: rows[0].onboarding_completed,
  };
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  if (!token) {
    fail(res, 401, 'unauthorized', 'Missing bearer token');
    return;
  }

  try {
    const userId = await verifySupabaseToken(token);
    const user = await loadAuthUser(userId);
    if (!user) {
      fail(res, 401, 'unauthorized', 'No application profile found for this user');
      return;
    }

    // Only block if the user has a company that is explicitly inactive
    if (user.companyId && user.companyIsActive === false && !user.isGlobalAdmin) {
      fail(res, 403, 'company_inactive', 'Company is inactive. Contact support.');
      return;
    }

    req.authUser = user;
    next();
  } catch (error) {
    if (isServiceUnavailableError(error)) {
      fail(res, 503, error.code, error.message);
      return;
    }

    fail(res, 401, 'unauthorized', 'Invalid or expired token', (error as Error).message);
  }
}

export function requireGlobalAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.authUser) {
    fail(res, 401, 'unauthorized', 'Authentication required');
    return;
  }
  if (!req.authUser.isGlobalAdmin) {
    fail(res, 403, 'forbidden', 'Global admin role required');
    return;
  }
  next();
}

export function hasPermission(user: AuthUser, permission: string) {
  if (user.isGlobalAdmin) return true;
  if (user.permissions.includes('*')) return true;
  return user.permissions.includes(permission);
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      fail(res, 401, 'unauthorized', 'Authentication required');
      return;
    }
    if (!hasPermission(req.authUser, permission)) {
      fail(res, 403, 'forbidden', `Permission required: ${permission}`);
      return;
    }
    next();
  };
}
