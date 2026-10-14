/**
 * Integration test against the real Supabase project (not a mock). Guards
 * against the 'readonly' role silently regressing to "does nothing" again
 * (found and fixed: it was a real, assignable role in the admin UI that no
 * RLS policy or RPC anywhere actually enforced).
 *
 * Requires a service-role key to provision + tear down disposable test
 * data. Set SUPABASE_SERVICE_ROLE_KEY in the environment to run this for
 * real; without it, the suite skips itself rather than failing CI for
 * everyone.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npm test -- readonly-role
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const describeIfService = SERVICE_ROLE_KEY ? describe : describe.skip;

describeIfService("readonly role: writes are blocked, reads and service_role are not", () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  const testEmail = `readonly-role-test-${Date.now()}@example.com`;
  const testPassword = 'TestPassword123!';
  let userId: string;
  let companyId: string;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });
    if (userErr || !userData.user) throw new Error(`Failed to create test user: ${userErr?.message}`);
    userId = userData.user.id;

    const { data: company, error: cErr } = await admin
      .from('companies')
      .insert({ name: 'Readonly Role Test Co', onboarding_completed: true, subscription_status: 'none', applicant_role: 'owner', billing_mode: 'per_module' })
      .select('id')
      .single();
    if (cErr || !company) throw new Error(`Failed to create company: ${cErr?.message}`);
    companyId = company.id;

    await admin.from('profiles').update({ company_id: companyId }).eq('user_id', userId);
    const { error: roleErr } = await admin.from('user_roles').insert({ user_id: userId, company_id: companyId, role: 'readonly' });
    if (roleErr) throw new Error(`Failed to assign readonly role: ${roleErr.message}`);

    const { error: signInErr } = await anon.auth.signInWithPassword({ email: testEmail, password: testPassword });
    if (signInErr) throw new Error(`Failed to sign in as test user: ${signInErr.message}`);
  });

  afterAll(async () => {
    if (companyId) await admin.from('companies').delete().eq('id', companyId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  it('blocks INSERT into a covered business table (tasks)', async () => {
    const { error } = await anon.from('tasks').insert({ company_id: companyId, created_by: userId, title: 'Should be blocked', status: 'pending' });
    expect(error).not.toBeNull();
    expect(error?.message).toContain('Read-only role cannot modify data');
  });

  it('blocks UPDATE on a covered business table (customers)', async () => {
    const { data: customer, error: insertErr } = await admin
      .from('customers')
      .insert({ company_id: companyId, created_by: userId, name: 'Probe', record_type: 'lead', email: 'probe@example.com' })
      .select('id')
      .single();
    expect(insertErr).toBeNull();

    const { error } = await anon.from('customers').update({ name: 'Renamed' }).eq('id', customer!.id);
    expect(error).not.toBeNull();
    expect(error?.message).toContain('Read-only role cannot modify data');
  });

  it('blocks DELETE on a covered business table (customers)', async () => {
    const { data: customer } = await admin
      .from('customers')
      .insert({ company_id: companyId, created_by: userId, name: 'Probe2', record_type: 'lead', email: 'probe2@example.com' })
      .select('id')
      .single();

    const { error, count } = await anon.from('customers').delete({ count: 'exact' }).eq('id', customer!.id);
    // RLS silently filters rather than erroring for DELETE in some cases, so assert on affected rows too.
    expect(error ?? (count === 0)).toBeTruthy();

    const { data: stillThere } = await admin.from('customers').select('id').eq('id', customer!.id).single();
    expect(stillThere?.id).toBe(customer!.id);
  });

  it('still allows SELECT (reads are not restricted by the readonly role)', async () => {
    const { data, error } = await anon.from('customers').select('id').eq('company_id', companyId);
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('does not block service_role writes for the same company', async () => {
    const { error } = await admin.from('tasks').insert({ company_id: companyId, created_by: userId, title: 'Service role write', status: 'pending' });
    expect(error).toBeNull();
  });
});
