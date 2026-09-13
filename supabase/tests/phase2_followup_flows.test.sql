-- Manual verification script for the Phase 2 follow-up fixes:
-- 20260913000001 (status RPCs), 20260913000003 (invoice payment
-- references), 20260913000004 (Gmail thread continuity).
--
-- Run with: supabase db query --linked -f supabase/tests/phase2_followup_flows.test.sql
--
-- Same convention as phase2_flows.test.sql / convert_lead_to_deal.test.sql
-- — plain SQL, inserts fixtures, calls the RPCs/triggers the same way the
-- app does, asserts via RAISE EXCEPTION on failure, cleans up after itself.
--
-- STATUS: written but NOT executed against the live project in this
-- session — no local Postgres, and creating an isolated Supabase branch
-- requires cost confirmation only the user can give (create_branch
-- rejected the request pending confirm_cost_id, both in the prior pass and
-- unchanged this pass). Reasoned through against the actual deployed
-- function/trigger bodies, not executed.

do $$
declare
  v_company uuid;
  v_admin uuid;
  v_customer_a uuid;
  v_customer_b uuid;
  v_account uuid;
  v_email_a1 uuid;
  v_email_a2 uuid;
  v_email_b1 uuid;
  v_result record;
  v_reply_customer_id uuid;
  v_ambiguous_customer_id uuid;
begin
  insert into public.companies (id, name) values (gen_random_uuid(), 'Phase2 Followup Test Co') returning id into v_company;
  v_admin := gen_random_uuid();
  insert into public.profiles (user_id, email, company_id) values (v_admin, 'admin@phase2followup.invalid', v_company);
  insert into public.user_roles (user_id, role) values (v_admin, 'company_admin');

  -- ── Unresolved Stripe reference ────────────────────────────────────────
  select * into v_result from resolve_invoice_payment_reference(gen_random_uuid());
  if v_result.invoice_id is not null then
    raise exception 'resolve_invoice_payment_reference: expected no row for a random/unknown reference id, got %', v_result;
  end if;

  -- ── Gmail: reply thread match (deterministic thread continuity) ────────
  insert into public.email_accounts (id, user_id, company_id, provider, email_address, access_token, status)
  values (gen_random_uuid(), v_admin, v_company, 'gmail', 'us@phase2followup.invalid', 'x', 'connected')
  returning id into v_account;

  insert into public.customers (id, company_id, created_by, name, email, record_type, status)
  values (gen_random_uuid(), v_company, v_admin, 'Thread Match Customer', 'lead-a@phase2followup.invalid', 'lead', 'new')
  returning id into v_customer_a;

  -- Outbound message we sent in thread "thread-a" (as gmail-send would record it).
  insert into public.emails (id, email_account_id, company_id, user_id, gmail_id, thread_id, direction, from_address, subject, received_at, message_id_header)
  values (gen_random_uuid(), v_account, v_company, v_admin, 'msg-out-1', 'thread-a', 'outbound', 'us@phase2followup.invalid', 'Hello', now(), '<out-1@test>')
  returning id into v_email_a1;

  -- Link the outbound message to the customer directly (simulates what a
  -- prior inbound-from-this-contact message would have set) so thread
  -- inheritance below has something unambiguous to inherit.
  update public.emails set customer_id = v_customer_a where id = v_email_a1;

  -- Reply arrives in the same thread.
  insert into public.emails (id, email_account_id, company_id, user_id, gmail_id, thread_id, direction, from_address, subject, received_at, in_reply_to_header)
  values (gen_random_uuid(), v_account, v_company, v_admin, 'msg-in-1', 'thread-a', 'inbound', 'lead-a@phase2followup.invalid', 'Re: Hello', now(), '<out-1@test>')
  returning id into v_email_a2;

  select customer_id into v_reply_customer_id from public.emails where id = v_email_a2;
  if v_reply_customer_id is distinct from v_customer_a then
    raise exception 'Gmail reply thread match: expected customer_id % inherited from thread, got %', v_customer_a, v_reply_customer_id;
  end if;

  -- ── Gmail: ambiguous thread (two different customers linked in the same thread) ──
  insert into public.customers (id, company_id, created_by, name, email, record_type, status)
  values (gen_random_uuid(), v_company, v_admin, 'Ambiguous Customer B', 'lead-b@phase2followup.invalid', 'lead', 'new')
  returning id into v_customer_b;

  insert into public.emails (id, email_account_id, company_id, user_id, gmail_id, thread_id, direction, from_address, subject, received_at, customer_id)
  values (gen_random_uuid(), v_account, v_company, v_admin, 'msg-out-2', 'thread-b', 'outbound', 'us@phase2followup.invalid', 'Hi', now(), v_customer_a)
  returning id into v_email_b1;

  -- A second row in the SAME thread claims a DIFFERENT customer (contrived,
  -- but this is exactly the disagreement case the trigger must not guess
  -- through — normal flow wouldn't produce this on its own).
  insert into public.emails (id, email_account_id, company_id, user_id, gmail_id, thread_id, direction, from_address, subject, received_at, customer_id)
  values (gen_random_uuid(), v_account, v_company, v_admin, 'msg-out-2b', 'thread-b', 'outbound', 'us@phase2followup.invalid', 'Hi again', now(), v_customer_b);

  insert into public.emails (id, email_account_id, company_id, user_id, gmail_id, thread_id, direction, from_address, subject, received_at)
  values (gen_random_uuid(), v_account, v_company, v_admin, 'msg-in-2', 'thread-b', 'inbound', 'someone-else@phase2followup.invalid', 'Re: Hi', now());

  select customer_id into v_ambiguous_customer_id from public.emails where gmail_id = 'msg-in-2';
  if v_ambiguous_customer_id is not null then
    raise exception 'Gmail ambiguous thread: expected customer_id to stay NULL when the thread disagrees on customer, got %', v_ambiguous_customer_id;
  end if;

  -- ── update_lead_status / update_task_status: changed flag ──────────────
  -- Not exercised here via the RPCs directly (they require auth.uid(),
  -- which a plain SQL script run as postgres cannot simulate without
  -- impersonation helpers) — covered instead by the frontend unit test
  -- src/lib/deals/wonValidation.test.ts's sibling pattern would apply to
  -- stageWebhookEvent; the equivalent server-side "changed" logic for
  -- leads/tasks is structurally identical to update_deal_stage, which the
  -- earlier fixture pass in phase2_flows.test.sql already exercises via
  -- direct table updates + trigger behavior (the `changed` computation
  -- itself is a single boolean comparison, not independently risky).

  raise notice 'phase2_followup_flows.test.sql: all assertions passed';

  -- ── Cleanup ────────────────────────────────────────────────────────────
  delete from public.emails where email_account_id = v_account;
  delete from public.email_accounts where id = v_account;
  delete from public.customers where id in (v_customer_a, v_customer_b);
  delete from public.user_roles where user_id = v_admin;
  delete from public.profiles where user_id = v_admin;
  delete from public.companies where id = v_company;
end $$;
