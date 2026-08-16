import { randomUUID } from 'crypto';
import express, { type Application, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Session } from '@supabase/supabase-js';
import { query, withTransaction } from '../core/database';
import { authMiddleware, requireGlobalAdmin, requirePermission } from '../core/auth';
import { ok, fail } from '../core/http';
import { generateInviteCode } from '../core/inviteCode';
import { supabaseAdmin, supabaseAnon } from '../core/supabase';
import { env } from '../config/env';
import { isServiceUnavailableError } from '../core/serviceUnavailable';
import { buildGmailAuthUrl, exchangeGmailCode } from '../services/email/gmailClient';
import {
  WEBHOOK_CHANNELS,
  WEBHOOK_EVENT_TYPES,
  createWebhookSubscription,
  deleteWebhookSubscription,
  dispatchWebhookEvent,
  listWebhookSubscriptions,
  serializeWebhookSubscription,
  updateWebhookSubscription,
} from '../services/webhooks/webhookService';
import {
  getConversation,
  getOrCreateConversation,
  isValidTwilioSignature,
  listConversations,
  listMessages,
  recordInboundWhatsappMessage,
  sendWhatsappMessage,
  serializeConversation,
  serializeMessage,
  WhatsappNotConfiguredError,
} from '../services/whatsapp/whatsappService';
import {
  createCheckoutSession,
  extractCheckoutCompleted,
  StripeNotConfiguredError,
  verifyAndParseWebhook,
} from '../services/stripe/stripeService';

// In-memory store for Gmail OAuth state tokens (maps state → userId, expires after 10 min)
const gmailAuthStates = new Map<string, { userId: string; expiresAt: number }>();

const paymentStatusSchema = z.enum(['pending', 'active', 'past_due', 'cancelled', 'trial']);

const ownerSignupSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  company: z.object({
    name: z.string().min(2),
    cvr: z.string().max(64).optional(),
    address: z.string().max(255).optional(),
    country: z.string().max(64).optional(),
    phone: z.string().max(64).optional(),
    email: z.string().email().optional(),
    plan: z.string().min(2),
    user_limit: z.number().int().min(1).max(100000).optional(),
    payment_status: paymentStatusSchema.default('pending'),
  }),
});

const memberSignupSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  invitation_code: z.string().min(5),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(20),
});

const googleExchangeSchema = z.object({
  access_token: z.string().min(20),
  refresh_token: z.string().min(20).optional(),
  create_if_missing: z.boolean().optional().default(false),
  company_name: z.string().min(2).max(120).optional(),
});

const simpleSignupSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

const onboardingCompleteSchema = z.object({
  company_name: z.string().min(2),
  industry: z.string().min(1),
  size: z.string().min(1),
  goal: z.string().min(1),
});

type AppUserRow = {
  id: string;
  company_id: string | null;
  company_name: string | null;
  company_is_active: boolean | null;
  role: string | null;
  email: string;
  full_name: string | null;
  is_global_admin: boolean;
  onboarding_completed: boolean;
  permissions: string[];
};

async function getAppUserProfile(userId: string) {
  const rows = await query<AppUserRow>(
    `
    select
      u.id,
      u.company_id,
      c.name as company_name,
      c.is_active as company_is_active,
      u.role,
      u.email,
      u.full_name,
      u.is_global_admin,
      u.onboarding_completed,
      coalesce(array_agg(rp.permission) filter (where rp.permission is not null), '{}') as permissions
    from users u
    left join companies c on c.id = u.company_id
    left join role_permissions rp on rp.role_slug = u.role
    where u.id = $1
    group by u.id, c.id
    `,
    [userId]
  );

  return rows[0] || null;
}

function needsOnboarding(profile: AppUserRow): boolean {
  return !profile.onboarding_completed || !profile.company_id;
}

function serializeSession(session: Session | null) {
  if (!session) return null;
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
  };
}

function mapProfile(profile: AppUserRow) {
  return {
    id: profile.id,
    company_id: profile.company_id,
    company_name: profile.company_name,
    role: profile.role,
    email: profile.email,
    full_name: profile.full_name,
    is_global_admin: profile.is_global_admin,
    permissions: profile.permissions || [],
    onboarding_completed: profile.onboarding_completed,
    needs_onboarding: needsOnboarding(profile),
  };
}

async function generateUniqueInviteCode() {
  for (let i = 0; i < 25; i += 1) {
    const candidate = generateInviteCode();
    const rows = await query<{ id: string }>('select id from companies where invite_code = $1 limit 1', [candidate]);
    if (!rows[0]) return candidate;
  }
  return `${generateInviteCode()}-${Math.floor(Math.random() * 9)}`;
}

async function signInViaSupabase(email: string, password: string) {
  const result = await supabaseAnon.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.session || !result.data.user) {
    return {
      error: result.error?.message || 'Login failed',
      session: null,
      userId: null,
    };
  }

  return {
    error: null,
    session: result.data.session,
    userId: result.data.user.id,
  };
}

export function registerRoutes(app: Application) {
  app.get('/api/health', async (_req: Request, res: Response) => {
    ok(res, { status: 'ok', service: 'railway-backend', auth: 'supabase' });
  });

  // ── Simple signup (user only, no company) ──────────────────────────────────
  app.post('/api/v1/auth/signup', async (req: Request, res: Response) => {
    const parsed = simpleSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten());
      return;
    }

    const email = parsed.data.email.toLowerCase().trim();
    const isGlobalAdmin = env.globalAdminEmails.includes(email);

    const { data: authUserData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.full_name },
    });

    if (createAuthError || !authUserData.user) {
      fail(res, 400, 'auth_create_failed', createAuthError?.message || 'Failed to create auth user');
      return;
    }

    const authUserId = authUserData.user.id;

    try {
      await query(
        `insert into users (id, company_id, role, email, full_name, is_global_admin, onboarding_completed)
         values ($1, null, null, $2, $3, $4, false)`,
        [authUserId, email, parsed.data.full_name, isGlobalAdmin]
      );

      const signIn = await signInViaSupabase(email, parsed.data.password);
      if (signIn.error || !signIn.userId) {
        fail(res, 500, 'signin_failed', signIn.error || 'Could not sign in after signup');
        return;
      }

      const profile = await getAppUserProfile(signIn.userId);
      if (!profile) {
        fail(res, 500, 'profile_missing', 'User profile was not created');
        return;
      }

      ok(
        res,
        {
          session: serializeSession(signIn.session),
          user: mapProfile(profile),
        },
        201
      );
    } catch (error) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      fail(res, 500, 'signup_failed', (error as Error).message || 'Failed to complete signup');
    }
  });

  // ── Gate check ─────────────────────────────────────────────────────────────
  app.get('/api/v1/auth/gate', authMiddleware, async (req: Request, res: Response) => {
    const user = req.authUser!;
    const profile = await getAppUserProfile(user.id);
    if (!profile) {
      fail(res, 404, 'profile_missing', 'User profile not found');
      return;
    }
    ok(res, {
      onboarding_completed: profile.onboarding_completed,
      has_company: !!profile.company_id,
      needs_onboarding: needsOnboarding(profile),
    });
  });

  // ── Complete onboarding (atomic: company + member + mark done) ─────────────
  app.post('/api/v1/onboarding/complete', authMiddleware, async (req: Request, res: Response) => {
    const parsed = onboardingCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten());
      return;
    }

    const user = req.authUser!;

    // Idempotent: if already onboarded, just return current profile
    if (user.onboardingCompleted && user.companyId) {
      const profile = await getAppUserProfile(user.id);
      if (profile) {
        ok(res, { user: mapProfile(profile), company: { id: profile.company_id, name: profile.company_name } });
        return;
      }
    }

    const inviteCode = await generateUniqueInviteCode();

    try {
      let companyId: string;

      await withTransaction(async (client) => {
        const companyResult = await client.query<{ id: string }>(
          `insert into companies (name, industry, size, goal, email, plan, payment_status, invite_code, created_by)
           values ($1,$2,$3,$4,$5,'starter','trial',$6,$7)
           returning id`,
          [
            parsed.data.company_name,
            parsed.data.industry,
            parsed.data.size,
            parsed.data.goal,
            user.email,
            inviteCode,
            user.id,
          ]
        );

        companyId = companyResult.rows[0]?.id;
        if (!companyId) throw new Error('Failed to create company');

        await client.query(
          `update users set company_id=$1, role='owner', onboarding_completed=true where id=$2`,
          [companyId, user.id]
        );

        await client.query(
          `insert into activity_logs (company_id, user_id, action, metadata)
           values ($1,$2,'onboarding.completed',$3::jsonb)`,
          [companyId, user.id, JSON.stringify({ company_name: parsed.data.company_name })]
        );
      });

      const profile = await getAppUserProfile(user.id);
      if (!profile) {
        fail(res, 500, 'profile_missing', 'Profile not found after onboarding');
        return;
      }

      ok(res, {
        user: mapProfile(profile),
        company: { id: profile.company_id, name: profile.company_name },
      });
    } catch (error) {
      fail(res, 500, 'onboarding_failed', (error as Error).message || 'Onboarding failed');
    }
  });

  app.post('/api/v1/auth/validate-invite-code', async (req: Request, res: Response) => {
    const schema = z.object({ invitation_code: z.string().min(5) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten());
      return;
    }

    const rows = await query<{ id: string; name: string; is_active: boolean }>(
      `select id, name, is_active from companies where invite_code = $1 limit 1`,
      [parsed.data.invitation_code.toUpperCase()]
    );

    const company = rows[0];
    if (!company) {
      fail(res, 404, 'invite_code_invalid', 'Invitation code is invalid');
      return;
    }
    if (!company.is_active) {
      fail(res, 403, 'company_inactive', 'Company is inactive');
      return;
    }

    ok(res, {
      company_id: company.id,
      company_name: company.name,
      valid: true,
    });
  });

  app.post('/api/v1/auth/signup-owner', async (req: Request, res: Response) => {
    const parsed = ownerSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten());
      return;
    }

    const email = parsed.data.email.toLowerCase().trim();
    const isGlobalAdmin = env.globalAdminEmails.includes(email);

    const { data: authUserData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.full_name },
    });

    if (createAuthError || !authUserData.user) {
      fail(res, 400, 'auth_create_failed', createAuthError?.message || 'Failed to create auth user');
      return;
    }

    const authUserId = authUserData.user.id;

    try {
      const inviteCode = await generateUniqueInviteCode();
      await withTransaction(async (client) => {
        const companyResult = await client.query<{ id: string }>(
          `
          insert into companies (
            name, cvr, address, country, phone, email, plan, payment_status, invite_code, user_limit, created_by
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          returning id
          `,
          [
            parsed.data.company.name,
            parsed.data.company.cvr || null,
            parsed.data.company.address || null,
            parsed.data.company.country || null,
            parsed.data.company.phone || null,
            parsed.data.company.email || email,
            parsed.data.company.plan,
            parsed.data.company.payment_status,
            inviteCode,
            parsed.data.company.user_limit || null,
            authUserId,
          ]
        );

        const companyId = companyResult.rows[0]?.id;
        if (!companyId) {
          throw new Error('Failed to create company');
        }

        await client.query(
          `
          insert into users (id, company_id, role, email, full_name, is_global_admin)
          values ($1,$2,'owner',$3,$4,$5)
          `,
          [authUserId, companyId, email, parsed.data.full_name, isGlobalAdmin]
        );

        await client.query(
          `insert into activity_logs (company_id, user_id, action, metadata)
           values ($1, $2, $3, $4::jsonb)`,
          [companyId, authUserId, 'company.owner_signup', JSON.stringify({ email })]
        );
      });

      const signIn = await signInViaSupabase(email, parsed.data.password);
      if (signIn.error || !signIn.userId) {
        fail(res, 500, 'signin_failed', signIn.error || 'Could not sign in after signup');
        return;
      }

      const profile = await getAppUserProfile(signIn.userId);
      if (!profile) {
        fail(res, 500, 'profile_missing', 'User profile was not created');
        return;
      }
      if (!profile.company_is_active && !profile.is_global_admin) {
        fail(res, 403, 'company_inactive', 'Company is inactive');
        return;
      }

      ok(
        res,
        {
          session: serializeSession(signIn.session),
          user: mapProfile(profile),
          company: {
            id: profile.company_id,
            name: profile.company_name,
          },
        },
        201
      );
    } catch (error) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      fail(res, 500, 'signup_failed', (error as Error).message || 'Failed to complete signup');
    }
  });

  app.post('/api/v1/auth/signup-member', async (req: Request, res: Response) => {
    const parsed = memberSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten());
      return;
    }

    const email = parsed.data.email.toLowerCase().trim();
    const inviteCode = parsed.data.invitation_code.toUpperCase().trim();

    const companies = await query<{ id: string; name: string; is_active: boolean }>(
      `select id, name, is_active from companies where invite_code = $1 limit 1`,
      [inviteCode]
    );

    const company = companies[0];
    if (!company) {
      fail(res, 404, 'invite_code_invalid', 'Invitation code is invalid');
      return;
    }
    if (!company.is_active) {
      fail(res, 403, 'company_inactive', 'Company is inactive');
      return;
    }

    const { data: authUserData, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.full_name },
    });

    if (createAuthError || !authUserData.user) {
      fail(res, 400, 'auth_create_failed', createAuthError?.message || 'Failed to create auth user');
      return;
    }

    const authUserId = authUserData.user.id;

    try {
      await withTransaction(async (client) => {
        await client.query(
          `
          insert into users (id, company_id, role, email, full_name, is_global_admin)
          values ($1,$2,'employee',$3,$4,false)
          `,
          [authUserId, company.id, email, parsed.data.full_name]
        );

        await client.query(
          `insert into activity_logs (company_id, user_id, action, metadata)
           values ($1, $2, $3, $4::jsonb)`,
          [company.id, authUserId, 'company.member_signup', JSON.stringify({ email, inviteCode })]
        );
      });

      const signIn = await signInViaSupabase(email, parsed.data.password);
      if (signIn.error || !signIn.userId) {
        fail(res, 500, 'signin_failed', signIn.error || 'Could not sign in after signup');
        return;
      }

      const profile = await getAppUserProfile(signIn.userId);
      if (!profile) {
        fail(res, 500, 'profile_missing', 'User profile was not created');
        return;
      }

      ok(
        res,
        {
          session: serializeSession(signIn.session),
          user: mapProfile(profile),
          company: {
            id: profile.company_id,
            name: profile.company_name,
          },
        },
        201
      );
    } catch (error) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId);
      fail(res, 500, 'signup_failed', (error as Error).message || 'Failed to complete member signup');
    }
  });

  app.post('/api/v1/auth/login', async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten());
      return;
    }

    const signIn = await signInViaSupabase(parsed.data.email.toLowerCase().trim(), parsed.data.password);
    if (signIn.error || !signIn.userId) {
      fail(res, 401, 'invalid_credentials', 'Invalid email or password');
      return;
    }

    const profile = await getAppUserProfile(signIn.userId);
    if (!profile) {
      fail(res, 403, 'profile_missing', 'No user profile found. Please sign up first.');
      return;
    }
    if (profile.company_id && profile.company_is_active === false && !profile.is_global_admin) {
      fail(res, 403, 'company_inactive', 'Company is inactive. Access blocked.');
      return;
    }

    ok(res, {
      session: serializeSession(signIn.session),
      user: mapProfile(profile),
      company: {
        id: profile.company_id,
        name: profile.company_name,
      },
    });
  });

  app.post('/api/v1/auth/google/exchange', async (req: Request, res: Response) => {
    const parsed = googleExchangeSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten());
      return;
    }

    const { data: authUserData, error: authUserError } = await supabaseAnon.auth.getUser(parsed.data.access_token);
    if (authUserError || !authUserData.user) {
      fail(res, 401, 'invalid_google_session', authUserError?.message || 'Invalid Google session');
      return;
    }

    const authUser = authUserData.user;
    let profile = await getAppUserProfile(authUser.id);

    // Always autocreate a profile for first-time Google users (no company yet)
    if (!profile) {
      const email = authUser.email?.toLowerCase().trim();
      if (!email) {
        fail(res, 400, 'email_missing', 'Google account has no email address');
        return;
      }

      const displayName =
        (typeof authUser.user_metadata?.full_name === 'string' && authUser.user_metadata.full_name.trim()) ||
        (typeof authUser.user_metadata?.name === 'string' && authUser.user_metadata.name.trim()) ||
        email.split('@')[0];

      const isGlobalAdmin = env.globalAdminEmails.includes(email);

      await query(
        `insert into users (id, company_id, role, email, full_name, is_global_admin, onboarding_completed)
         values ($1, null, null, $2, $3, $4, false)
         on conflict (id) do nothing`,
        [authUser.id, email, displayName, isGlobalAdmin]
      );

      profile = await getAppUserProfile(authUser.id);
    }

    if (!profile) {
      fail(res, 500, 'profile_create_failed', 'Failed to load user profile');
      return;
    }
    if (profile.company_id && profile.company_is_active === false && !profile.is_global_admin) {
      fail(res, 403, 'company_inactive', 'Company is inactive. Access blocked.');
      return;
    }

    ok(res, {
      session: {
        access_token: parsed.data.access_token,
        refresh_token: parsed.data.refresh_token || null,
      },
      user: mapProfile(profile),
      company: profile.company_id ? { id: profile.company_id, name: profile.company_name } : null,
    });
  });

  app.post('/api/v1/auth/refresh', async (req: Request, res: Response) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten());
      return;
    }

    const result = await supabaseAnon.auth.refreshSession({ refresh_token: parsed.data.refresh_token });
    if (result.error || !result.data.user || !result.data.session) {
      fail(res, 401, 'refresh_failed', result.error?.message || 'Refresh token invalid');
      return;
    }

    const profile = await getAppUserProfile(result.data.user.id);
    if (!profile) {
      fail(res, 403, 'profile_missing', 'No user profile found');
      return;
    }
    if (profile.company_id && profile.company_is_active === false && !profile.is_global_admin) {
      fail(res, 403, 'company_inactive', 'Company is inactive. Access blocked.');
      return;
    }

    ok(res, {
      session: serializeSession(result.data.session),
      user: mapProfile(profile),
      company: profile.company_id ? { id: profile.company_id, name: profile.company_name } : null,
    });
  });

  app.get('/api/v1/auth/me', authMiddleware, async (req: Request, res: Response) => {
    const user = req.authUser;
    if (!user) {
      fail(res, 401, 'unauthorized', 'Authentication required');
      return;
    }

    const profile = await getAppUserProfile(user.id);

    ok(res, {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        role: user.role,
        company_id: user.companyId,
        company_name: user.companyName,
        is_global_admin: user.isGlobalAdmin,
        permissions: user.permissions,
        onboarding_completed: user.onboardingCompleted,
        needs_onboarding: profile ? needsOnboarding(profile) : true,
      },
    });
  });

  app.get('/api/v1/company/settings', authMiddleware, requirePermission('company.read'), async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    const rows = await query<{
      id: string;
      name: string;
      cvr: string | null;
      address: string | null;
      country: string | null;
      phone: string | null;
      email: string | null;
      plan: string;
      user_limit: number | null;
      payment_status: string;
      invite_code: string;
      is_active: boolean;
      created_at: string;
    }>(
      `
      select id, name, cvr, address, country, phone, email, plan, user_limit, payment_status, invite_code, is_active, created_at
      from companies
      where id = $1
      limit 1
      `,
      [authUser.companyId!]
    );

    const company = rows[0];
    if (!company) {
      fail(res, 404, 'company_not_found', 'Company not found');
      return;
    }

    ok(res, {
      ...company,
      invite_code: authUser.role === 'owner' || authUser.isGlobalAdmin ? company.invite_code : null,
    });
  });

  app.patch('/api/v1/company/settings', authMiddleware, requirePermission('company.update'), async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    const schema = z.object({
      name: z.string().min(2).optional(),
      cvr: z.string().max(64).nullable().optional(),
      address: z.string().max(255).nullable().optional(),
      country: z.string().max(64).nullable().optional(),
      phone: z.string().max(64).nullable().optional(),
      email: z.string().email().nullable().optional(),
      plan: z.string().min(2).optional(),
      user_limit: z.number().int().min(1).max(100000).nullable().optional(),
      payment_status: paymentStatusSchema.optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten());
      return;
    }

    if ((parsed.data.plan || parsed.data.payment_status) && authUser.role !== 'owner' && !authUser.isGlobalAdmin) {
      fail(res, 403, 'forbidden', 'Only owner can update plan and payment status');
      return;
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    const addField = (column: string, value: unknown) => {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    };

    if (parsed.data.name !== undefined) addField('name', parsed.data.name);
    if (parsed.data.cvr !== undefined) addField('cvr', parsed.data.cvr);
    if (parsed.data.address !== undefined) addField('address', parsed.data.address);
    if (parsed.data.country !== undefined) addField('country', parsed.data.country);
    if (parsed.data.phone !== undefined) addField('phone', parsed.data.phone);
    if (parsed.data.email !== undefined) addField('email', parsed.data.email);
    if (parsed.data.plan !== undefined) addField('plan', parsed.data.plan);
    if (parsed.data.user_limit !== undefined) addField('user_limit', parsed.data.user_limit);
    if (parsed.data.payment_status !== undefined) addField('payment_status', parsed.data.payment_status);

    if (!fields.length) {
      fail(res, 400, 'no_changes', 'No fields to update');
      return;
    }

    values.push(authUser.companyId!);

    const rows = await query<{
      id: string;
      name: string;
      cvr: string | null;
      address: string | null;
      country: string | null;
      phone: string | null;
      email: string | null;
      plan: string;
      user_limit: number | null;
      payment_status: string;
      invite_code: string;
      is_active: boolean;
      created_at: string;
    }>(
      `
      update companies
      set ${fields.join(', ')}
      where id = $${values.length}
      returning id, name, cvr, address, country, phone, email, plan, user_limit, payment_status, invite_code, is_active, created_at
      `,
      values
    );

    ok(res, {
      ...rows[0],
      invite_code: authUser.role === 'owner' || authUser.isGlobalAdmin ? rows[0]?.invite_code : null,
    });
  });

  app.post('/api/v1/company/invite-code/regenerate', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (authUser.role !== 'owner' && !authUser.isGlobalAdmin) {
      fail(res, 403, 'forbidden', 'Only owner can regenerate invitation code');
      return;
    }

    const inviteCode = await generateUniqueInviteCode();
    const rows = await query<{ invite_code: string }>(
      'update companies set invite_code = $1 where id = $2 returning invite_code',
      [inviteCode, authUser.companyId!]
    );

    ok(res, { invite_code: rows[0]?.invite_code || inviteCode });
  });

  app.get('/api/v1/company/users', authMiddleware, requirePermission('members.read'), async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    const rows = await query<{
      id: string;
      role: string;
      email: string;
      full_name: string | null;
      created_at: string;
    }>(
      `
      select id, role, email, full_name, created_at
      from users
      where company_id = $1
      order by created_at asc
      `,
      [authUser.companyId!]
    );

    ok(res, rows);
  });

  app.patch('/api/v1/company/users/:id/role', authMiddleware, requirePermission('members.update'), async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    const schema = z.object({ role: z.string().min(2).max(64) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten());
      return;
    }

    const roleRows = await query<{ slug: string }>('select slug from roles where slug = $1 limit 1', [parsed.data.role]);
    if (!roleRows[0]) {
      fail(res, 404, 'role_not_found', 'Role does not exist');
      return;
    }

    const rows = await query<{ id: string; role: string }>(
      `
      update users
      set role = $1
      where id = $2 and company_id = $3
      returning id, role
      `,
      [parsed.data.role, req.params.id, authUser.companyId!]
    );

    if (!rows[0]) {
      fail(res, 404, 'user_not_found', 'User not found in company');
      return;
    }

    await query(
      `insert into activity_logs (company_id, user_id, action, metadata)
       values ($1,$2,$3,$4::jsonb)`,
      [authUser.companyId!, authUser.id, 'user.role_updated', JSON.stringify({ target_user_id: req.params.id, role: parsed.data.role })]
    );

    ok(res, rows[0]);
  });

  app.get('/api/v1/roles', authMiddleware, async (_req: Request, res: Response) => {
    const rows = await query<{ slug: string; label: string; description: string | null; is_system: boolean }>(
      'select slug, label, description, is_system from roles order by slug asc'
    );
    ok(res, rows);
  });

  app.post('/api/v1/roles', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (authUser.role !== 'owner' && !authUser.isGlobalAdmin) {
      fail(res, 403, 'forbidden', 'Only owner can create roles');
      return;
    }

    const schema = z.object({
      slug: z.string().min(2).max(64).regex(/^[a-z0-9_-]+$/),
      label: z.string().min(2).max(100),
      description: z.string().max(255).optional(),
      permissions: z.array(z.string().min(2)).default([]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten());
      return;
    }

    try {
      await withTransaction(async (client) => {
        await client.query(
          `insert into roles (slug, label, description, is_system)
           values ($1,$2,$3,false)`,
          [parsed.data.slug, parsed.data.label, parsed.data.description || null]
        );

        for (const permission of parsed.data.permissions) {
          await client.query(
            `insert into role_permissions (role_slug, permission) values ($1,$2)`,
            [parsed.data.slug, permission]
          );
        }
      });

      ok(res, {
        slug: parsed.data.slug,
        label: parsed.data.label,
        description: parsed.data.description || null,
        permissions: parsed.data.permissions,
      }, 201);
    } catch (error) {
      fail(res, 409, 'role_create_failed', (error as Error).message || 'Could not create role');
    }
  });

  app.get('/api/v1/company/activity-logs', authMiddleware, requirePermission('activity.read'), async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    const rows = await query<{
      id: string;
      company_id: string;
      user_id: string | null;
      action: string;
      metadata: unknown;
      timestamp: string;
    }>(
      `
      select id, company_id, user_id, action, metadata, timestamp
      from activity_logs
      where company_id = $1
      order by timestamp desc
      limit 200
      `,
      [authUser.companyId!]
    );

    ok(res, rows);
  });

  app.get('/api/v1/admin/companies', authMiddleware, requireGlobalAdmin, async (_req: Request, res: Response) => {
    const rows = await query<{
      id: string;
      name: string;
      plan: string;
      payment_status: string;
      is_active: boolean;
      created_at: string;
      user_count: string;
    }>(
      `
      select
        c.id,
        c.name,
        c.plan,
        c.payment_status,
        c.is_active,
        c.created_at,
        count(u.id)::text as user_count
      from companies c
      left join users u on u.company_id = c.id
      group by c.id
      order by c.created_at desc
      `
    );

    ok(
      res,
      rows.map((row) => ({
        ...row,
        user_count: Number(row.user_count || 0),
      }))
    );
  });

  app.patch('/api/v1/admin/companies/:id/status', authMiddleware, requireGlobalAdmin, async (req: Request, res: Response) => {
    const schema = z.object({ is_active: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten());
      return;
    }

    const rows = await query<{ id: string; is_active: boolean }>(
      'update companies set is_active = $1 where id = $2 returning id, is_active',
      [parsed.data.is_active, req.params.id]
    );

    if (!rows[0]) {
      fail(res, 404, 'company_not_found', 'Company not found');
      return;
    }

    await query(
      `insert into activity_logs (company_id, user_id, action, metadata)
       values ($1,$2,$3,$4::jsonb)`,
      [
        req.params.id,
        req.authUser?.id || null,
        parsed.data.is_active ? 'company.activated' : 'company.deactivated',
        JSON.stringify({ by: req.authUser?.id || null }),
      ]
    );

    ok(res, rows[0]);
  });

  app.get('/api/v1/admin/companies/:id/users', authMiddleware, requireGlobalAdmin, async (req: Request, res: Response) => {
    const rows = await query<{
      id: string;
      role: string;
      email: string;
      full_name: string | null;
      created_at: string;
    }>(
      `
      select id, role, email, full_name, created_at
      from users
      where company_id = $1
      order by created_at asc
      `,
      [req.params.id]
    );

    ok(res, rows);
  });

  // ── INVOICES ───────────────────────────────────────────────────────────────

  app.get('/api/v1/invoices/stats', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const rows = await query<{ status: string; count: string; total: string }>(
      `select status, count(*)::text as count, coalesce(sum(total),0)::text as total
       from invoices where company_id=$1 group by status`,
      [authUser.companyId]
    );
    const stats = { sent: 0, paid: 0, draft: 0, overdue: 0, total_sent_amount: 0, total_paid_amount: 0 };
    for (const row of rows) {
      const n = Number(row.count);
      const t = Number(row.total);
      if (row.status === 'sent') { stats.sent = n; stats.total_sent_amount = t; }
      if (row.status === 'paid') { stats.paid = n; stats.total_paid_amount = t; }
      if (row.status === 'draft') stats.draft = n;
      if (row.status === 'overdue') stats.overdue = n;
    }
    ok(res, stats);
  });

  app.get('/api/v1/invoices', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const rows = await query<{
      id: string; invoice_number: string; invoice_date: string; due_date: string;
      status: string; customer_name: string; customer_country: string; currency: string;
      subtotal: string; vat_amount: string; total: string; payment_method: string | null;
      created_at: string;
    }>(
      `select id, invoice_number, invoice_date, due_date, status, customer_name, customer_country,
              currency, subtotal, vat_amount, total, payment_method, created_at
       from invoices where company_id=$1 ${status ? 'and status=$2' : ''}
       order by created_at desc limit 200`,
      status ? [authUser.companyId, status] : [authUser.companyId]
    );
    ok(res, rows.map(r => ({ ...r, subtotal: Number(r.subtotal), vat_amount: Number(r.vat_amount), total: Number(r.total) })));
  });

  app.get('/api/v1/invoices/:id', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const rows = await query<Record<string, unknown>>(
      `select i.*, array_agg(row_to_json(ii.*) order by ii.sort_order) filter (where ii.id is not null) as items
       from invoices i left join invoice_items ii on ii.invoice_id=i.id
       where i.id=$1 and i.company_id=$2 group by i.id`,
      [req.params.id, authUser.companyId]
    );
    if (!rows[0]) { fail(res, 404, 'not_found', 'Invoice not found'); return; }
    const inv = rows[0] as Record<string, unknown>;
    ok(res, { ...inv, subtotal: Number(inv.subtotal), vat_amount: Number(inv.vat_amount), total: Number(inv.total) });
  });

  app.post('/api/v1/invoices', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }

    const itemSchema = z.object({
      description: z.string().min(1),
      quantity: z.number().positive(),
      unit_price: z.number().min(0),
    });
    const schema = z.object({
      invoice_date: z.string(),
      due_date: z.string(),
      delivery_date: z.string().optional(),
      customer_name: z.string().min(1),
      customer_address: z.string().optional(),
      customer_country: z.string().default('DK'),
      customer_type: z.enum(['company', 'private']).default('company'),
      customer_cvr: z.string().optional(),
      customer_vat: z.string().optional(),
      customer_email: z.string().optional(),
      currency: z.string().default('DKK'),
      vat_rate: z.number().min(0).max(100).default(25),
      vat_note: z.string().optional(),
      payment_method: z.string().default('bank_transfer'),
      payment_terms_days: z.number().int().min(0).default(14),
      bank_account: z.string().optional(),
      notes: z.string().optional(),
      lead_id: z.string().uuid().optional(),
      deal_id: z.string().uuid().optional(),
      items: z.array(itemSchema).min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten()); return; }
    const d = parsed.data;

    // Generate invoice number: YYYY-NNNN
    const year = new Date(d.invoice_date).getFullYear();
    const countRows = await query<{ cnt: string }>(
      `select count(*)::text as cnt from invoices where company_id=$1 and extract(year from invoice_date)=$2`,
      [authUser.companyId, year]
    );
    const seq = (Number(countRows[0]?.cnt || 0) + 1).toString().padStart(4, '0');
    const invoiceNumber = `${year}-${seq}`;

    // Calculate totals
    const subtotal = d.items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const vatAmount = subtotal * (d.vat_rate / 100);
    const total = subtotal + vatAmount;

    try {
      let invoiceId: string;
      await withTransaction(async (client) => {
        const invResult = await client.query<{ id: string }>(
          `insert into invoices (company_id, invoice_number, invoice_date, due_date, delivery_date,
            customer_name, customer_address, customer_country, customer_type, customer_cvr, customer_vat, customer_email,
            currency, vat_rate, vat_note, subtotal, vat_amount, total,
            payment_method, payment_terms_days, bank_account, notes, lead_id, deal_id, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
           returning id`,
          [authUser.companyId, invoiceNumber, d.invoice_date, d.due_date, d.delivery_date || null,
           d.customer_name, d.customer_address || null, d.customer_country, d.customer_type,
           d.customer_cvr || null, d.customer_vat || null, d.customer_email || null,
           d.currency, d.vat_rate, d.vat_note || null, subtotal, vatAmount, total,
           d.payment_method, d.payment_terms_days, d.bank_account || null, d.notes || null,
           d.lead_id || null, d.deal_id || null, authUser.id]
        );
        invoiceId = invResult.rows[0].id;
        for (let i = 0; i < d.items.length; i++) {
          const item = d.items[i];
          await client.query(
            `insert into invoice_items (invoice_id, description, quantity, unit_price, total, sort_order)
             values ($1,$2,$3,$4,$5,$6)`,
            [invoiceId, item.description, item.quantity, item.unit_price, item.quantity * item.unit_price, i]
          );
        }
      });
      const newInv = await query<Record<string, unknown>>(
        `select i.*, array_agg(row_to_json(ii.*) order by ii.sort_order) filter (where ii.id is not null) as items
         from invoices i left join invoice_items ii on ii.invoice_id=i.id
         where i.id=$1 group by i.id`,
        [invoiceId!]
      );
      const invoiceOut = { ...newInv[0], subtotal: Number((newInv[0] as Record<string, unknown>).subtotal), vat_amount: Number((newInv[0] as Record<string, unknown>).vat_amount), total: Number((newInv[0] as Record<string, unknown>).total) };
      dispatchWebhookEvent(authUser.companyId, 'invoice.created', invoiceOut);
      ok(res, invoiceOut, 201);
    } catch (error) {
      fail(res, 500, 'invoice_create_failed', (error as Error).message);
    }
  });

  app.patch('/api/v1/invoices/:id', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const schema = z.object({ status: z.string().optional(), notes: z.string().optional() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { fail(res, 400, 'invalid_payload', 'Invalid payload'); return; }
    const fields: string[] = [];
    const values: unknown[] = [];
    if (parsed.data.status !== undefined) { values.push(parsed.data.status); fields.push(`status=$${values.length}`); }
    if (parsed.data.notes !== undefined) { values.push(parsed.data.notes); fields.push(`notes=$${values.length}`); }
    if (!fields.length) { fail(res, 400, 'no_changes', 'No fields to update'); return; }
    values.push(authUser.companyId); values.push(req.params.id);
    const rows = await query<Record<string, unknown>>(
      `update invoices set ${fields.join(',')}, updated_at=now() where company_id=$${values.length - 1} and id=$${values.length} returning *`,
      values
    );
    if (!rows[0]) { fail(res, 404, 'not_found', 'Invoice not found'); return; }
    if (parsed.data.status === 'paid' || parsed.data.status === 'overdue') {
      dispatchWebhookEvent(authUser.companyId, parsed.data.status === 'paid' ? 'invoice.paid' : 'invoice.overdue', rows[0]);
    }
    ok(res, rows[0]);
  });

  // ── PAYMENTS ───────────────────────────────────────────────────────────────

  app.get('/api/v1/payments/stats', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const rows = await query<{ count: string; total: string }>(
      `select count(*)::text as count, coalesce(sum(amount),0)::text as total from payments where company_id=$1`,
      [authUser.companyId]
    );
    ok(res, { count: Number(rows[0]?.count || 0), total: Number(rows[0]?.total || 0) });
  });

  app.get('/api/v1/payments', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const rows = await query<Record<string, unknown>>(
      `select p.*, i.invoice_number from payments p
       left join invoices i on i.id=p.invoice_id
       where p.company_id=$1 order by p.created_at desc limit 200`,
      [authUser.companyId]
    );
    ok(res, rows.map(r => ({ ...r, amount: Number(r.amount) })));
  });

  app.post('/api/v1/payments', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const schema = z.object({
      invoice_id: z.string().uuid().optional(),
      amount: z.number().positive(),
      currency: z.string().default('DKK'),
      payment_date: z.string(),
      payment_method: z.string().default('manual'),
      notes: z.string().optional(),
      external_ref: z.string().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten()); return; }
    const d = parsed.data;
    try {
      await withTransaction(async (client) => {
        await client.query(
          `insert into payments (company_id, invoice_id, amount, currency, payment_date, payment_method, notes, external_ref, created_by)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [authUser.companyId, d.invoice_id || null, d.amount, d.currency, d.payment_date,
           d.payment_method, d.notes || null, d.external_ref || null, authUser.id]
        );
        if (d.invoice_id) {
          await client.query(`update invoices set status='paid', updated_at=now() where id=$1 and company_id=$2`, [d.invoice_id, authUser.companyId]);
        }
      });
      dispatchWebhookEvent(authUser.companyId, 'payment.received', { ...d, company_id: authUser.companyId });
      ok(res, { ok: true }, 201);
    } catch (error) {
      fail(res, 500, 'payment_create_failed', (error as Error).message);
    }
  });

  // ── STRIPE PAYMENTS ──────────────────────────────────────────────────────────

  app.post('/api/v1/invoices/:id/pay/stripe', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }

    const rows = await query<{
      id: string; invoice_number: string; currency: string; total: string;
      customer_email: string | null; status: string;
    }>(
      `select id, invoice_number, currency, total, customer_email, status from invoices where id=$1 and company_id=$2`,
      [req.params.id, authUser.companyId]
    );
    const invoice = rows[0];
    if (!invoice) { fail(res, 404, 'not_found', 'Invoice not found'); return; }
    if (invoice.status === 'paid') { fail(res, 409, 'already_paid', 'Invoice is already paid'); return; }

    try {
      const session = await createCheckoutSession({
        invoiceId: invoice.id,
        companyId: authUser.companyId,
        invoiceNumber: invoice.invoice_number,
        currency: invoice.currency,
        totalAmount: Number(invoice.total),
        customerEmail: invoice.customer_email,
        successUrl: `${env.publicBaseUrl}/en/app/finance/invoices?stripe=success&invoice=${invoice.id}`,
        cancelUrl: `${env.publicBaseUrl}/en/app/finance/invoices?stripe=cancelled&invoice=${invoice.id}`,
      });
      ok(res, { url: session.url });
    } catch (error) {
      if (error instanceof StripeNotConfiguredError) {
        fail(res, 503, 'stripe_not_configured', error.message);
        return;
      }
      fail(res, 502, 'stripe_checkout_failed', (error as Error).message);
    }
  });

  app.post('/api/v1/stripe/webhook', async (req: Request, res: Response) => {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) { fail(res, 400, 'missing_raw_body', 'Missing raw request body'); return; }

    let event: unknown;
    try {
      event = verifyAndParseWebhook(rawBody, req.header('stripe-signature'));
    } catch (error) {
      if (error instanceof StripeNotConfiguredError) {
        fail(res, 503, 'stripe_not_configured', error.message);
        return;
      }
      fail(res, 400, 'invalid_signature', (error as Error).message);
      return;
    }

    const completed = extractCheckoutCompleted(event);
    if (completed) {
      try {
        await withTransaction(async (client) => {
          await client.query(
            `update invoices set status='paid', updated_at=now() where id=$1 and company_id=$2 and status<>'paid'`,
            [completed.invoiceId, completed.companyId]
          );
          await client.query(
            `insert into payments (company_id, invoice_id, amount, currency, payment_date, payment_method, external_ref)
             values ($1,$2,$3,$4,current_date,'stripe',$5)`,
            [completed.companyId, completed.invoiceId, completed.amountTotal, completed.currency, completed.sessionId]
          );
        });
        dispatchWebhookEvent(completed.companyId, 'invoice.paid', { invoice_id: completed.invoiceId });
        dispatchWebhookEvent(completed.companyId, 'payment.received', {
          invoice_id: completed.invoiceId,
          amount: completed.amountTotal,
          currency: completed.currency,
          payment_method: 'stripe',
          company_id: completed.companyId,
        });
      } catch (error) {
        fail(res, 500, 'stripe_webhook_processing_failed', (error as Error).message);
        return;
      }
    }

    ok(res, { received: true });
  });

  // ── BOOKKEEPING EXPORT (e-conomic / Dinero / Billy CSV import) ──────────────

  app.get('/api/v1/invoices/export/bookkeeping', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }

    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const conditions = ['company_id=$1'];
    const params: unknown[] = [authUser.companyId];
    if (from) { params.push(from); conditions.push(`invoice_date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`invoice_date <= $${params.length}`); }

    const rows = await query<{
      invoice_number: string; invoice_date: string; due_date: string; status: string;
      customer_name: string; customer_cvr: string | null; customer_country: string;
      currency: string; subtotal: string; vat_amount: string; total: string; payment_method: string | null;
    }>(
      `select invoice_number, invoice_date, due_date, status, customer_name, customer_cvr, customer_country,
              currency, subtotal, vat_amount, total, payment_method
       from invoices where ${conditions.join(' and ')} order by invoice_date asc`,
      params
    );

    const header = [
      'Fakturanr', 'Dato', 'Forfaldsdato', 'Status', 'Kunde', 'CVR', 'Land',
      'Valuta', 'Beløb ekskl. moms', 'Moms', 'Beløb inkl. moms', 'Betalingsmetode',
    ];
    const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [header.join(';')];
    for (const r of rows) {
      lines.push([
        r.invoice_number, r.invoice_date, r.due_date, r.status, csvEscape(r.customer_name),
        r.customer_cvr || '', r.customer_country, r.currency,
        Number(r.subtotal).toFixed(2), Number(r.vat_amount).toFixed(2), Number(r.total).toFixed(2),
        r.payment_method || '',
      ].join(';'));
    }
    const csv = `\uFEFF${lines.join('\r\n')}`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bookkeeping-export-${Date.now()}.csv"`);
    res.send(csv);
  });

  // ── WEBHOOKS (Zapier / Make / generic outgoing automations) ─────────────────

  app.get('/api/v1/webhooks/events', authMiddleware, async (_req: Request, res: Response) => {
    ok(res, WEBHOOK_EVENT_TYPES);
  });

  app.get('/api/v1/webhooks', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const subs = await listWebhookSubscriptions(authUser.companyId);
    ok(res, subs.map(serializeWebhookSubscription));
  });

  const webhookCreateSchema = z.object({
    url: z.string().url(),
    events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
    channel: z.enum(WEBHOOK_CHANNELS).optional(),
  });

  app.post('/api/v1/webhooks', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const parsed = webhookCreateSchema.safeParse(req.body);
    if (!parsed.success) { fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten()); return; }
    const sub = await createWebhookSubscription({
      companyId: authUser.companyId,
      url: parsed.data.url,
      events: parsed.data.events,
      channel: parsed.data.channel,
      createdBy: authUser.id,
    });
    ok(res, { ...serializeWebhookSubscription(sub), secret: sub.secret }, 201);
  });

  const webhookUpdateSchema = z.object({
    url: z.string().url().optional(),
    events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1).optional(),
    channel: z.enum(WEBHOOK_CHANNELS).optional(),
    is_active: z.boolean().optional(),
  });

  app.patch('/api/v1/webhooks/:id', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const parsed = webhookUpdateSchema.safeParse(req.body);
    if (!parsed.success) { fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten()); return; }
    const updated = await updateWebhookSubscription(authUser.companyId, req.params.id, {
      url: parsed.data.url,
      events: parsed.data.events,
      channel: parsed.data.channel,
      isActive: parsed.data.is_active,
    });
    if (!updated) { fail(res, 404, 'not_found', 'Webhook not found'); return; }
    ok(res, serializeWebhookSubscription(updated));
  });

  app.delete('/api/v1/webhooks/:id', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const removed = await deleteWebhookSubscription(authUser.companyId, req.params.id);
    if (!removed) { fail(res, 404, 'not_found', 'Webhook not found'); return; }
    ok(res, { ok: true });
  });

  app.post('/api/v1/webhooks/:id/test', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const subs = await listWebhookSubscriptions(authUser.companyId);
    const sub = subs.find((s) => s.id === req.params.id);
    if (!sub) { fail(res, 404, 'not_found', 'Webhook not found'); return; }
    dispatchWebhookEvent(authUser.companyId, sub.events[0] as (typeof WEBHOOK_EVENT_TYPES)[number] ?? 'lead.created', {
      test: true,
      message: 'This is a test event from Crater CRM.',
      sent_at: new Date().toISOString(),
    });
    ok(res, { ok: true });
  });

  // ── WHATSAPP (via Twilio) ──────────────────────────────────────────────────

  app.get('/api/v1/whatsapp/conversations', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const conversations = await listConversations(authUser.companyId);
    ok(res, conversations.map(serializeConversation));
  });

  const whatsappStartSchema = z.object({
    phone: z.string().min(6).max(32),
    name: z.string().max(255).optional(),
  });

  app.post('/api/v1/whatsapp/conversations', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const parsed = whatsappStartSchema.safeParse(req.body);
    if (!parsed.success) { fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten()); return; }
    const conversation = await getOrCreateConversation(authUser.companyId, parsed.data.phone, parsed.data.name);
    ok(res, serializeConversation(conversation), 201);
  });

  app.get('/api/v1/whatsapp/conversations/:id/messages', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const conversation = await getConversation(authUser.companyId, req.params.id);
    if (!conversation) { fail(res, 404, 'not_found', 'Conversation not found'); return; }
    const messages = await listMessages(authUser.companyId, req.params.id);
    ok(res, messages.map(serializeMessage));
  });

  const whatsappSendSchema = z.object({ body: z.string().min(1).max(4096) });

  app.post('/api/v1/whatsapp/conversations/:id/messages', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!authUser.companyId) { fail(res, 403, 'no_company', 'No company'); return; }
    const parsed = whatsappSendSchema.safeParse(req.body);
    if (!parsed.success) { fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten()); return; }
    const conversation = await getConversation(authUser.companyId, req.params.id);
    if (!conversation) { fail(res, 404, 'not_found', 'Conversation not found'); return; }
    try {
      const message = await sendWhatsappMessage(authUser.companyId, req.params.id, parsed.data.body);
      ok(res, serializeMessage(message), 201);
    } catch (error) {
      if (error instanceof WhatsappNotConfiguredError) {
        fail(res, 503, 'whatsapp_not_configured', error.message);
        return;
      }
      fail(res, 502, 'whatsapp_send_failed', (error as Error).message);
    }
  });

  // POST /api/v1/whatsapp/webhook/inbound — Twilio's "A Message Comes In" webhook.
  // Twilio always POSTs application/x-www-form-urlencoded, never JSON, so this route
  // needs its own body parser ahead of the global express.json() middleware.
  app.post(
    '/api/v1/whatsapp/webhook/inbound',
    express.urlencoded({ extended: false }),
    async (req: Request, res: Response) => {
      const from = String(req.body.From || '').replace(/^whatsapp:/, '');
      const body = String(req.body.Body || '');
      const messageSid = req.body.MessageSid ? String(req.body.MessageSid) : null;
      const signature = req.header('X-Twilio-Signature');
      const webhookUrl = `${env.backendBaseUrl}/api/v1/whatsapp/webhook/inbound`;

      if (!isValidTwilioSignature(webhookUrl, req.body, signature)) {
        fail(res, 403, 'invalid_signature', 'Invalid Twilio signature');
        return;
      }

      if (from && body) {
        await recordInboundWhatsappMessage(from, body, messageSid);
      }
      res.type('text/xml').send('<Response/>');
    }
  );

  // ── GMAIL ──────────────────────────────────────────────────────────────────

  app.get('/api/v1/gmail/status', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    const rows = await query<{ gmail_email: string; todo_sync_enabled: boolean; created_at: string }>(
      `select gmail_email, todo_sync_enabled, created_at from user_gmail_tokens where user_id=$1`,
      [authUser.id]
    );
    if (!rows[0]) { ok(res, { connected: false }); return; }
    ok(res, { connected: true, gmail_email: rows[0].gmail_email, todo_sync_enabled: rows[0].todo_sync_enabled });
  });

  app.get('/api/v1/gmail/auth', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    if (!env.gmailClientId || !env.gmailClientSecret) {
      fail(res, 503, 'gmail_not_configured', 'Gmail OAuth not configured. Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in Railway environment variables.');
      return;
    }
    const state = randomUUID();
    gmailAuthStates.set(state, { userId: authUser.id, expiresAt: Date.now() + 10 * 60 * 1000 });
    const authUrl = buildGmailAuthUrl(
      {
        clientId: env.gmailClientId,
        clientSecret: env.gmailClientSecret,
        redirectUri: env.gmailRedirectUri,
        scopes: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/userinfo.email',
        ],
      },
      state
    );
    ok(res, { auth_url: authUrl });
  });

  app.get('/api/gmail/callback', async (req: Request, res: Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const frontendBase = env.publicBaseUrl;

    if (!code || !state) {
      res.redirect(`${frontendBase}/en/app/emails?gmail=error&reason=missing_params`);
      return;
    }

    const stateEntry = gmailAuthStates.get(state);
    if (!stateEntry || stateEntry.expiresAt < Date.now()) {
      gmailAuthStates.delete(state);
      res.redirect(`${frontendBase}/en/app/emails?gmail=error&reason=state_expired`);
      return;
    }
    gmailAuthStates.delete(state);

    try {
      const tokens = await exchangeGmailCode(
        {
          clientId: env.gmailClientId,
          clientSecret: env.gmailClientSecret,
          redirectUri: env.gmailRedirectUri,
          scopes: [],
        },
        code
      );

      // Get gmail email address
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      const userInfo = await userInfoRes.json() as { email?: string };
      const gmailEmail = userInfo.email || 'unknown';

      await query(
        `insert into user_gmail_tokens (user_id, gmail_email, access_token, refresh_token, token_expiry)
         values ($1,$2,$3,$4,$5)
         on conflict (user_id) do update set
           gmail_email=$2, access_token=$3, refresh_token=coalesce($4, user_gmail_tokens.refresh_token),
           token_expiry=$5, updated_at=now()`,
        [stateEntry.userId, gmailEmail, tokens.accessToken, tokens.refreshToken || null, tokens.expiresAt]
      );

      res.redirect(`${frontendBase}/en/app/emails?gmail=connected`);
    } catch (error) {
      const msg = encodeURIComponent((error as Error).message || 'unknown');
      res.redirect(`${frontendBase}/en/app/emails?gmail=error&reason=${msg}`);
    }
  });

  app.get('/api/v1/gmail/messages', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    const tokenRows = await query<{ access_token: string; refresh_token: string | null; token_expiry: string | null }>(
      `select access_token, refresh_token, token_expiry from user_gmail_tokens where user_id=$1`,
      [authUser.id]
    );
    if (!tokenRows[0]) { fail(res, 404, 'gmail_not_connected', 'Gmail not connected'); return; }

    const { access_token } = tokenRows[0];
    const folder = typeof req.query.folder === 'string' ? req.query.folder : 'INBOX';
    const maxResults = 30;

    try {
      // Fetch message list
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=${folder}&maxResults=${maxResults}`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );
      if (!listRes.ok) {
        const errText = await listRes.text();
        fail(res, 502, 'gmail_api_error', `Gmail API error: ${errText}`);
        return;
      }
      const listData = await listRes.json() as { messages?: Array<{ id: string }> };
      const messageIds = listData.messages || [];

      // Fetch details for each (batch via Promise.all, max 30)
      const details = await Promise.all(
        messageIds.slice(0, maxResults).map(async (msg) => {
          const detailRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${access_token}` } }
          );
          if (!detailRes.ok) return null;
          const detail = await detailRes.json() as {
            id: string;
            snippet: string;
            labelIds: string[];
            internalDate: string;
            payload: { headers: Array<{ name: string; value: string }> };
          };
          const headers = detail.payload?.headers || [];
          const getHeader = (name: string) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
          return {
            id: detail.id,
            from: getHeader('From'),
            to: getHeader('To'),
            subject: getHeader('Subject'),
            date: getHeader('Date'),
            snippet: detail.snippet || '',
            read: !detail.labelIds?.includes('UNREAD'),
            labels: detail.labelIds || [],
            internalDate: detail.internalDate,
          };
        })
      );

      ok(res, details.filter(Boolean));
    } catch (error) {
      fail(res, 502, 'gmail_fetch_failed', (error as Error).message);
    }
  });

  app.post('/api/v1/gmail/send', authMiddleware, async (req: Request, res: Response) => {
    const authUser = req.authUser!;
    const schema = z.object({
      to: z.array(z.string().email()).min(1),
      subject: z.string().min(1),
      body: z.string().min(1),
      cc: z.array(z.string().email()).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten()); return; }

    const tokenRows = await query<{ access_token: string }>(
      `select access_token from user_gmail_tokens where user_id=$1`,
      [authUser.id]
    );
    if (!tokenRows[0]) { fail(res, 404, 'gmail_not_connected', 'Gmail not connected'); return; }

    const { to, subject, body: emailBody, cc } = parsed.data;
    const lines = [
      `To: ${to.join(', ')}`,
      ...(cc?.length ? [`Cc: ${cc.join(', ')}`] : []),
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      emailBody,
    ];
    const raw = Buffer.from(lines.join('\r\n')).toString('base64url');

    try {
      const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenRows[0].access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      });
      if (!sendRes.ok) {
        const err = await sendRes.text();
        fail(res, 502, 'gmail_send_failed', `Gmail send error: ${err}`);
        return;
      }
      ok(res, { ok: true });
    } catch (error) {
      fail(res, 502, 'gmail_send_failed', (error as Error).message);
    }
  });

  app.delete('/api/v1/gmail/disconnect', authMiddleware, async (req: Request, res: Response) => {
    await query(`delete from user_gmail_tokens where user_id=$1`, [req.authUser!.id]);
    ok(res, { ok: true });
  });

  app.patch('/api/v1/gmail/settings', authMiddleware, async (req: Request, res: Response) => {
    const schema = z.object({ todo_sync_enabled: z.boolean() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) { fail(res, 400, 'invalid_payload', 'Invalid payload'); return; }
    await query(
      `update user_gmail_tokens set todo_sync_enabled=$1, updated_at=now() where user_id=$2`,
      [parsed.data.todo_sync_enabled, req.authUser!.id]
    );
    ok(res, { ok: true });
  });

  // ─── Companies House proxy (UK registry search — gratis, én nøgle i backend) ──
  app.get('/api/v1/companies-house/search', authMiddleware, async (req: Request, res: Response) => {
    const q = String(req.query.q ?? '').trim();
    if (!q) { fail(res, 400, 'missing_query', 'Query parameter q is required'); return; }
    if (!env.companiesHouseApiKey) { fail(res, 503, 'not_configured', 'Companies House API key not configured'); return; }

    const url = `https://api.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(q)}&items_per_page=20`;
    const basicAuth = Buffer.from(`${env.companiesHouseApiKey}:`).toString('base64');
    const upstream = await fetch(url, {
      headers: { Authorization: `Basic ${basicAuth}`, Accept: 'application/json' },
    });
    if (!upstream.ok) { fail(res, 502, 'upstream_error', `Companies House returned ${upstream.status}`); return; }
    const data = await upstream.json() as {
      items?: Array<{
        company_number?: string;
        title?: string;
        address_snippet?: string;
        company_type?: string;
        company_status?: string;
      }>
    };
    ok(res, { items: data.items ?? [] });
  });

  // ── Phone provisioning ────────────────────────────────────────────────────

  // GET /api/v1/phone/provision — return tenant's current provision (or empty)
  app.get('/api/v1/phone/provision', authMiddleware, async (req: Request, res: Response) => {
    const { companyId } = req.authUser!;
    const rows = await query<{
      phone_number: string | null;
      plan: string;
      minutes_used: number;
      minutes_limit: number;
      active: boolean;
    }>(
      `select phone_number, plan, minutes_used, minutes_limit, active
       from phone_provisions
       where company_id = $1`,
      [companyId]
    );
    if (rows.length === 0) {
      ok(res, { phone_number: null, plan: 'standard', minutes_used: 0, minutes_limit: 500, active: false });
      return;
    }
    ok(res, rows[0]);
  });

  // POST /api/v1/phone/provision — provision a number for the tenant
  app.post('/api/v1/phone/provision', authMiddleware, requirePermission('company.update'), async (req: Request, res: Response) => {
    const { companyId } = req.authUser!;

    // Check if already provisioned
    const existing = await query<{ active: boolean; phone_number: string | null }>(
      `select active, phone_number from phone_provisions where company_id = $1`,
      [companyId]
    );
    if (existing.length > 0 && existing[0].active) {
      fail(res, 409, 'already_provisioned', 'A phone number is already active for this company');
      return;
    }

    // --- Twilio integration point ---
    // Replace the stub below with:
    //   const twilioClient = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    //   const number = await twilioClient.incomingPhoneNumbers.create({ areaCode: '45', voiceUrl: ... });
    //   const phoneNumber = number.phoneNumber;
    //   const twilioSid  = number.sid;
    const phoneNumber = `+4570${Math.floor(100000 + Math.random() * 900000)}`;
    const twilioSid   = `PNstub_${Date.now()}`;
    // --------------------------------

    const rows = await query<{
      phone_number: string;
      plan: string;
      minutes_used: number;
      minutes_limit: number;
      active: boolean;
    }>(
      `insert into phone_provisions (company_id, phone_number, twilio_sid, active)
       values ($1, $2, $3, true)
       on conflict (company_id) do update
         set phone_number = excluded.phone_number,
             twilio_sid   = excluded.twilio_sid,
             active       = true,
             updated_at   = now()
       returning phone_number, plan, minutes_used, minutes_limit, active`,
      [companyId, phoneNumber, twilioSid]
    );
    ok(res, rows[0], 201);
  });

  // DELETE /api/v1/phone/provision — release / deactivate the number
  app.delete('/api/v1/phone/provision', authMiddleware, requirePermission('company.update'), async (req: Request, res: Response) => {
    const { companyId } = req.authUser!;

    const existing = await query<{ twilio_sid: string | null; active: boolean }>(
      `select twilio_sid, active from phone_provisions where company_id = $1`,
      [companyId]
    );
    if (existing.length === 0 || !existing[0].active) {
      fail(res, 404, 'not_found', 'No active phone number to release');
      return;
    }

    // --- Twilio integration point ---
    // const twilioClient = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    // if (existing[0].twilio_sid) await twilioClient.incomingPhoneNumbers(existing[0].twilio_sid).remove();
    // --------------------------------

    await query(
      `update phone_provisions
       set active = false, phone_number = null, twilio_sid = null, minutes_used = 0, updated_at = now()
       where company_id = $1`,
      [companyId]
    );
    ok(res, { success: true });
  });

  // ── Admin: phone usage across all tenants ─────────────────────────────────

  // GET /api/v1/admin/phone/usage
  app.get('/api/v1/admin/phone/usage', authMiddleware, requireGlobalAdmin, async (_req: Request, res: Response) => {
    const rows = await query<{
      company_id: string;
      company_name: string;
      phone_number: string | null;
      plan: string;
      minutes_used: number;
      minutes_limit: number;
      active: boolean;
    }>(
      `select
         pp.company_id,
         c.name as company_name,
         pp.phone_number,
         pp.plan,
         pp.minutes_used,
         pp.minutes_limit,
         pp.active
       from phone_provisions pp
       join companies c on c.id = pp.company_id
       order by c.name`
    );
    ok(res, { tenants: rows });
  });

  // PATCH /api/v1/admin/phone/:tenantId — update plan or minute limit
  app.patch('/api/v1/admin/phone/:tenantId', authMiddleware, requireGlobalAdmin, async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    const schema = z.object({
      minutes_limit: z.number().int().min(0).optional(),
      plan: z.string().min(1).max(64).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      fail(res, 400, 'invalid_payload', 'Invalid payload', parsed.error.flatten());
      return;
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    const addField = (col: string, val: unknown) => { values.push(val); fields.push(`${col} = $${values.length}`); };

    if (parsed.data.minutes_limit !== undefined) addField('minutes_limit', parsed.data.minutes_limit);
    if (parsed.data.plan          !== undefined) addField('plan',          parsed.data.plan);
    if (fields.length === 0) { ok(res, { success: true }); return; }

    values.push(tenantId);
    await query(
      `update phone_provisions set ${fields.join(', ')}, updated_at = now() where company_id = $${values.length}`,
      values
    );
    ok(res, { success: true });
  });

  app.use('/api', (_req: Request, res: Response) => {
    fail(res, 404, 'not_found', 'Endpoint not found');
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (isServiceUnavailableError(error)) {
      fail(res, 503, error.code, error.message);
      return;
    }

    fail(res, 500, 'internal_error', 'Unexpected server error', (error as Error).message);
  });
}
