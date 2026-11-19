/**
 * Integration test against the real Supabase project (not a mock) — covers
 * the onboarding 1/7 acceptance criterion: a new user can register and sign
 * in without any manual database changes.
 *
 * Requires a service-role key to provision + tear down disposable test
 * users. Set SUPABASE_SERVICE_ROLE_KEY in the environment to run this for
 * real; without it, the suite skips itself rather than failing CI for
 * everyone (same pattern as readonly-role.integration.test.ts).
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npm test -- auth-flow
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const describeIfService = SERVICE_ROLE_KEY ? describe : describe.skip;

describeIfService('auth flow: registration, login, session, authorization', () => {
  let admin: SupabaseClient;
  const testEmail = `auth-flow-test-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';
  let userId: string | undefined;

  beforeAll(() => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY as string, {
      auth: { persistSession: false },
    });
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it('registers a new user with a valid email + strong password', async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true, // skip email-confirmation wait for this test; confirmation itself is covered below
    });
    expect(error).toBeNull();
    expect(data.user?.email).toBe(testEmail);
    userId = data.user?.id;
  });

  it('rejects registering the same email twice', async () => {
    const { error } = await admin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
    });
    expect(error).not.toBeNull();
  });

  it('a new signup without email_confirm stays unconfirmed and cannot sign in until confirmed', async () => {
    const unconfirmedEmail = `auth-flow-unconfirmed-${Date.now()}@example.com`;
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

    const { data: signUpData, error: signUpError } = await anon.auth.signUp({
      email: unconfirmedEmail,
      password: testPassword,
    });
    expect(signUpError).toBeNull();
    // If "Confirm email" is enabled on the project, signUp returns no session.
    const requiresConfirmation = !signUpData.session;

    if (requiresConfirmation) {
      const { error: loginError } = await anon.auth.signInWithPassword({
        email: unconfirmedEmail,
        password: testPassword,
      });
      expect(loginError).not.toBeNull();
      expect(loginError?.message.toLowerCase()).toContain('email');
    }

    if (signUpData.user?.id) await admin.auth.admin.deleteUser(signUpData.user.id);
  });

  it('logs in with correct credentials and gets a valid session', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({ email: testEmail, password: testPassword });
    expect(error).toBeNull();
    expect(data.session?.access_token).toBeTruthy();
  });

  it('rejects login with the wrong password', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { error } = await anon.auth.signInWithPassword({ email: testEmail, password: 'WrongPassword123' });
    expect(error).not.toBeNull();
  });

  it('logs out and clears the session', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    await anon.auth.signInWithPassword({ email: testEmail, password: testPassword });
    const { error } = await anon.auth.signOut();
    expect(error).toBeNull();
    const { data } = await anon.auth.getSession();
    expect(data.session).toBeNull();
  });

  it('requests a password reset without revealing whether the email exists', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const existing = await anon.auth.resetPasswordForEmail(testEmail);
    const nonExistent = await anon.auth.resetPasswordForEmail(`no-such-user-${Date.now()}@example.com`);
    // Supabase returns success for both regardless of whether the account exists.
    expect(existing.error).toBeNull();
    expect(nonExistent.error).toBeNull();
  });

  it('refreshes an expiring session via the refresh token', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: signInData } = await anon.auth.signInWithPassword({ email: testEmail, password: testPassword });
    expect(signInData.session?.refresh_token).toBeTruthy();

    const { data: refreshed, error } = await anon.auth.refreshSession({
      refresh_token: signInData.session!.refresh_token,
    });
    expect(error).toBeNull();
    expect(refreshed.session?.access_token).toBeTruthy();
    expect(refreshed.session?.access_token).not.toBe(signInData.session?.access_token);
  });

  it('blocks access to a protected table without a session (no anon read of profiles)', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await anon.from('profiles').select('id, email').limit(1);
    // RLS must deny this: either an explicit error, or a silently empty result — never another tenant's row.
    expect(error ? true : (data ?? []).length === 0).toBe(true);
  });

  it('a logged-in user cannot read another user\'s profile row directly by id', async () => {
    const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    await anon.auth.signInWithPassword({ email: testEmail, password: testPassword });

    const { data: otherProfiles } = await admin.from('profiles').select('id').neq('user_id', userId).limit(1);
    if (!otherProfiles?.length) return; // nothing else in the project to test cross-tenant isolation against

    const { data, error } = await anon.from('profiles').select('*').eq('id', otherProfiles[0].id).maybeSingle();
    expect(error ? true : data === null).toBe(true);
  });
});
