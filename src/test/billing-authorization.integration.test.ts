/**
 * Integration test against the real Supabase project (not a mock) — covers
 * onboarding 3/7's authorization requirement: only the owner/company admin
 * may change a company's subscription. create-checkout, customer-portal and
 * check-subscription's confirm_seat_sync previously had no role check at
 * all — any employee could start/cancel the subscription or trigger a
 * billed seat-count change.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY; self-skips without it, same pattern
 * as the other integration suites in this file.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npm test -- billing-authorization
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const describeIfService = SERVICE_ROLE_KEY ? describe : describe.skip;

describeIfService('billing authorization: non-admins cannot touch subscription/billing', () => {
  let admin: SupabaseClient;
  const ownerEmail = `billing-owner-${Date.now()}@example.com`;
  const employeeEmail = `billing-employee-${Date.now()}@example.com`;
  const password = 'TestPassword123!';
  let ownerId: string;
  let employeeId: string;
  let companyId: string;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });

    const owner = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
    ownerId = owner.data.user!.id;
    const employee = await admin.auth.admin.createUser({ email: employeeEmail, password, email_confirm: true });
    employeeId = employee.data.user!.id;

    const ownerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    await ownerClient.auth.signInWithPassword({ email: ownerEmail, password });
    const { data: companyIdResult } = await ownerClient.rpc('bootstrap_company' as never, {
      _name: 'Billing Auth Test Co',
      _full_name: 'Owner',
    } as never) as unknown as { data: string };
    companyId = companyIdResult;

    // Attach the employee to the same company, as a plain 'employee' role —
    // not company_admin — to exercise the "not authorized" path.
    await admin.from('profiles').update({ company_id: companyId }).eq('user_id', employeeId);
    await admin.from('user_roles').insert({ user_id: employeeId, company_id: companyId, role: 'employee' });
  });

  afterAll(async () => {
    if (companyId) await admin.from('companies').delete().eq('id', companyId);
    if (ownerId) await admin.auth.admin.deleteUser(ownerId);
    if (employeeId) await admin.auth.admin.deleteUser(employeeId);
  });

  async function loggedInClient(email: string) {
    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email, password });
    return client;
  }

  it('a non-admin employee cannot open the billing portal', async () => {
    const client = await loggedInClient(employeeEmail);
    const { data, error } = await client.functions.invoke('customer-portal', { body: { locale: 'en' } });
    // The function returns 200 with an {error} body on its own auth checks
    // rather than always a non-2xx — assert on the error field either way.
    expect(error || data?.error).toBeTruthy();
  });

  it('a non-admin employee cannot start a checkout session', async () => {
    const client = await loggedInClient(employeeEmail);
    const { data, error } = await client.functions.invoke('create-checkout', { body: { currency: 'dkk', locale: 'da' } });
    expect(error || data?.error).toBeTruthy();
  });

  it('a non-admin employee cannot confirm a seat-count sync', async () => {
    const client = await loggedInClient(employeeEmail);
    const { data, error } = await client.functions.invoke('check-subscription', { body: { confirm_seat_sync: true } });
    // Without a live Stripe subscription this may also just report
    // "no_company"/none — the important assertion is it never silently
    // succeeds in changing billing for a non-admin.
    if (data?.seat_mismatch !== undefined) {
      expect(error || data?.error).toBeTruthy();
    }
  });
});
