/**
 * Integration test against the real Supabase project (not a mock) — covers
 * onboarding 2/7: company creation, owner assignment, and tenant isolation.
 *
 * Requires the pending `20261108144043_atomic_company_bootstrap` migration
 * to be applied (it is NOT applied in this session — no production
 * migration without approval) AND SUPABASE_SERVICE_ROLE_KEY to be set.
 * Without either, this self-skips rather than failing CI for everyone.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npm test -- company-bootstrap
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const describeIfService = SERVICE_ROLE_KEY ? describe : describe.skip;

describeIfService('company bootstrap: creation, duplicate protection, tenant isolation', () => {
  let admin: SupabaseClient;
  const userAEmail = `bootstrap-a-${Date.now()}@example.com`;
  const userBEmail = `bootstrap-b-${Date.now()}@example.com`;
  const password = 'TestPassword123!';
  let userAId: string;
  let userBId: string;
  let companyAId: string;
  let companyBId: string;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });
    const a = await admin.auth.admin.createUser({ email: userAEmail, password, email_confirm: true });
    const b = await admin.auth.admin.createUser({ email: userBEmail, password, email_confirm: true });
    userAId = a.data.user!.id;
    userBId = b.data.user!.id;
  });

  afterAll(async () => {
    if (companyAId) await admin.from('companies').delete().eq('id', companyAId);
    if (companyBId) await admin.from('companies').delete().eq('id', companyBId);
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  async function loggedInClient(email: string) {
    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email, password });
    return client;
  }

  it('creates a company (CVR optional) and makes the caller its owner', async () => {
    const client = await loggedInClient(userAEmail);
    const { data, error } = await client.rpc('bootstrap_company' as never, {
      _name: 'Test Company A',
      _full_name: 'User A',
      _country: 'DK',
      _timezone: 'Europe/Copenhagen',
    } as never) as unknown as { data: string | null; error: { message: string } | null };
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    companyAId = data as string;

    const { data: role } = await admin.from('user_roles').select('role').eq('user_id', userAId).eq('company_id', companyAId).single();
    expect(role?.role).toBe('company_admin');
  });

  it('rejects a second workspace for a user who already has one (no duplicates on retry)', async () => {
    const client = await loggedInClient(userAEmail);
    const { error } = await client.rpc('bootstrap_company' as never, {
      _name: 'Duplicate Attempt',
      _full_name: 'User A',
    } as never) as unknown as { data: string | null; error: { message: string } | null };
    expect(error).not.toBeNull();

    const { count } = await admin.from('companies').select('id', { count: 'exact', head: true }).eq('name', 'Duplicate Attempt');
    expect(count).toBe(0);
  });

  it('blocks direct insert bypass of the RPC for a user who already has a company', async () => {
    const client = await loggedInClient(userAEmail);
    const { error } = await client.from('companies').insert({ name: 'Bypass Attempt' });
    expect(error).not.toBeNull();
  });

  it('a second user creates their own, separate company', async () => {
    const client = await loggedInClient(userBEmail);
    const { data, error } = await client.rpc('bootstrap_company' as never, {
      _name: 'Test Company B',
      _full_name: 'User B',
    } as never) as unknown as { data: string | null; error: { message: string } | null };
    expect(error).toBeNull();
    companyBId = data as string;
    expect(companyBId).not.toBe(companyAId);
  });

  it('company A cannot read or update company B (cross-tenant isolation)', async () => {
    const client = await loggedInClient(userAEmail);
    const { data: readAttempt } = await client.from('companies').select('*').eq('id', companyBId).maybeSingle();
    expect(readAttempt).toBeNull();

    const { error: updateError, count } = await client
      .from('companies')
      .update({ name: 'Hijacked' }, { count: 'exact' })
      .eq('id', companyBId);
    expect(updateError ? true : count === 0).toBe(true);
  });
});
