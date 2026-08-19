/**
 * Integration test against the real Supabase project (not a mock). It
 * directly re-runs the exploit found and fixed in this session: an
 * authenticated user PATCHing their own profiles.company_id to an
 * arbitrary company should be rejected by RLS/column grants, not allowed.
 *
 * Requires a service-role key to provision + tear down disposable test
 * users (the anon/publishable key alone can't create confirmed users or
 * clean up afterwards). Set SUPABASE_SERVICE_ROLE_KEY in the environment
 * to run this for real; without it, the suite skips itself rather than
 * failing CI for everyone.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npm test -- tenant-isolation
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const describeIfService = SERVICE_ROLE_KEY ? describe : describe.skip;

describeIfService('tenant isolation: profiles.company_id cannot be self-assigned', () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  const testEmail = `tenant-isolation-test-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';
  let userId: string;
  let companyAId: string;
  let companyBId: string;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY!);
    anon = createClient(SUPABASE_URL, ANON_KEY);

    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });
    if (userErr || !userData.user) throw new Error(`Failed to create test user: ${userErr?.message}`);
    userId = userData.user.id;

    const { data: companyA, error: aErr } = await admin
      .from('companies')
      .insert({ name: 'Tenant Isolation Test Co A', status: 'active', mode: 'live' })
      .select('id')
      .single();
    if (aErr || !companyA) throw new Error(`Failed to create company A: ${aErr?.message}`);
    companyAId = companyA.id;

    const { data: companyB, error: bErr } = await admin
      .from('companies')
      .insert({ name: 'Tenant Isolation Test Co B (target)', status: 'active', mode: 'live' })
      .select('id')
      .single();
    if (bErr || !companyB) throw new Error(`Failed to create company B: ${bErr?.message}`);
    companyBId = companyB.id;

    await admin.from('profiles').update({ company_id: companyAId }).eq('user_id', userId);
  });

  afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (companyAId) await admin.from('companies').delete().eq('id', companyAId);
    if (companyBId) await admin.from('companies').delete().eq('id', companyBId);
  });

  it('rejects a direct PATCH of company_id to a company the user has no invitation to', async () => {
    const { error: signInErr } = await anon.auth.signInWithPassword({ email: testEmail, password: testPassword });
    expect(signInErr).toBeNull();

    const { error: patchErr } = await anon.from('profiles').update({ company_id: companyBId }).eq('user_id', userId);

    // Must fail - column-level grant restricts company_id to full_name/avatar_url/onboarding_completed only.
    expect(patchErr).not.toBeNull();

    const { data: profileAfter } = await admin.from('profiles').select('company_id').eq('user_id', userId).single();
    expect(profileAfter?.company_id).toBe(companyAId);
  });

  it('still allows the same user to update their own full_name', async () => {
    const { error } = await anon.from('profiles').update({ full_name: 'Renamed via test' }).eq('user_id', userId);
    expect(error).toBeNull();
  });
});
