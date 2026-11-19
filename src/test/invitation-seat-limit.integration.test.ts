/**
 * Integration test against the real Supabase project (not a mock) —
 * onboarding 4/7: invitations must respect the actual seat limit.
 *
 * Requires the pending `20261108150512_invitation_seat_limit` migration to
 * be applied (NOT applied this session — no production migration without
 * approval) AND SUPABASE_SERVICE_ROLE_KEY. Self-skips without either, same
 * pattern as the other integration suites.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npm test -- invitation-seat-limit
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const describeIfService = SERVICE_ROLE_KEY ? describe : describe.skip;

describeIfService('invitation seat limit: accept is blocked when no seats remain', () => {
  let admin: SupabaseClient;
  const ownerEmail = `seat-owner-${Date.now()}@example.com`;
  const inviteeEmail = `seat-invitee-${Date.now()}@example.com`;
  const password = 'TestPassword123!';
  let ownerId: string;
  let inviteeId: string;
  let companyId: string;

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY as string, { auth: { persistSession: false } });

    const owner = await admin.auth.admin.createUser({ email: ownerEmail, password, email_confirm: true });
    ownerId = owner.data.user!.id;
    const invitee = await admin.auth.admin.createUser({ email: inviteeEmail, password, email_confirm: true });
    inviteeId = invitee.data.user!.id;

    const ownerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    await ownerClient.auth.signInWithPassword({ email: ownerEmail, password });
    const { data: companyIdResult } = await ownerClient.rpc('bootstrap_company' as never, {
      _name: 'Seat Limit Test Co', _full_name: 'Owner',
    } as never) as unknown as { data: string };
    companyId = companyIdResult;

    // Trialing with a seat_limit_trial of 1 — the owner already occupies it.
    await admin.from('companies').update({ subscription_status: 'trialing', seat_limit_trial: 1 }).eq('id', companyId);
  });

  afterAll(async () => {
    if (companyId) await admin.from('companies').delete().eq('id', companyId);
    if (ownerId) await admin.auth.admin.deleteUser(ownerId);
    if (inviteeId) await admin.auth.admin.deleteUser(inviteeId);
  });

  it('rejects accepting an invitation when the company has no free seats', async () => {
    const ownerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    await ownerClient.auth.signInWithPassword({ email: ownerEmail, password });
    const { data: token, error: createError } = await ownerClient.rpc('create_invitation', {
      invite_email: inviteeEmail, invite_role: 'employee',
    });
    expect(createError).toBeNull();

    const inviteeClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    await inviteeClient.auth.signInWithPassword({ email: inviteeEmail, password });
    const { error: acceptError } = await inviteeClient.rpc('accept_invitation', { invite_token: token as string });
    expect(acceptError).not.toBeNull();
    expect(acceptError?.message.toLowerCase()).toContain('seat');

    const { data: profile } = await admin.from('profiles').select('company_id').eq('user_id', inviteeId).single();
    expect(profile?.company_id).toBeNull();
  });

  it('accepts once a seat is freed up', async () => {
    await admin.from('companies').update({ seat_limit_trial: 2 }).eq('id', companyId);

    const inviteeClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    await inviteeClient.auth.signInWithPassword({ email: inviteeEmail, password });

    const ownerClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    await ownerClient.auth.signInWithPassword({ email: ownerEmail, password });
    const { data: token } = await ownerClient.rpc('create_invitation', { invite_email: inviteeEmail, invite_role: 'employee' });

    const { error } = await inviteeClient.rpc('accept_invitation', { invite_token: token as string });
    expect(error).toBeNull();

    const { data: profile } = await admin.from('profiles').select('company_id').eq('user_id', inviteeId).single();
    expect(profile?.company_id).toBe(companyId);
  });
});
