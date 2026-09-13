-- Phase 2, Flow 2: Gmail / email reply routing.
--
-- Confirmed before writing this migration: gmail-sync already upserts
-- inbound messages into `emails` idempotently (unique on
-- (email_account_id, gmail_id)), but nothing resolves the sender to a
-- contact/lead/deal, nothing emits an event when mail arrives, and nothing
-- reacts to a reply. `emails` never contains outbound messages (gmail-send
-- doesn't write to it), so "is this a reply" can't be judged from thread
-- continuity inside `emails` alone. The one place outbound sends ARE
-- tracked with a matching reply signal is `bulk_email_recipients.replied_at`
-- (already a column, never written to before this migration) for the bulk
-- campaign flow, and `customers.next_followup_at` for the general
-- lead-followup reminder (already a column, set by lead-gen tooling, never
-- cleared before this migration).
--
-- Resolution here is deterministic-only, per instruction: a single
-- unambiguous normalized-email match links the message; zero or multiple
-- matches leave it unlinked rather than guessing.

alter table public.emails
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists deal_id uuid references public.deals(id) on delete set null;

create index if not exists emails_customer_idx on public.emails (customer_id) where customer_id is not null;
create index if not exists emails_deal_idx on public.emails (deal_id) where deal_id is not null;

create or replace function public.trg_resolve_inbound_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_norm_from text;
  v_customer_id uuid;
  v_customer_count integer;
  v_deal_id uuid;
  v_deal_count integer;
  v_had_pending_followup boolean := false;
  v_event_type text := 'email.received';
begin
  begin
    v_norm_from := nullif(lower(trim(NEW.from_address)), '');
    if v_norm_from is null then
      return NEW;
    end if;

    -- Deterministic match only: exactly one customer/lead row with this
    -- normalized email in the company. Ambiguous (0 or >1) stays unlinked.
    select count(*) into v_customer_count
    from public.customers c
    where c.company_id = NEW.company_id and c.normalized_email = v_norm_from;

    if v_customer_count = 1 then
      select c.id, (c.next_followup_at is not null) into v_customer_id, v_had_pending_followup
      from public.customers c
      where c.company_id = NEW.company_id and c.normalized_email = v_norm_from;

      -- A reply from a known contact cancels/pauses whatever pending
      -- follow-up reminder was scheduled for them.
      update public.customers
      set next_followup_at = null, last_touched_at = now()
      where id = v_customer_id;

      select count(*) into v_deal_count
      from public.deals d
      where d.customer_id = v_customer_id and d.stage not in ('won', 'lost');

      if v_deal_count = 1 then
        select d.id into v_deal_id
        from public.deals d
        where d.customer_id = v_customer_id and d.stage not in ('won', 'lost');
      end if;

      v_event_type := 'email.replied';
    end if;

    -- Independently, if this address was ever a bulk-campaign recipient with
    -- no recorded reply yet, mark it replied so campaign sequencing can stop
    -- emailing them further. Deterministic on exact address match.
    update public.bulk_email_recipients
    set replied_at = now()
    where company_id = NEW.company_id
      and lower(trim(email)) = v_norm_from
      and replied_at is null;
    if found then
      v_event_type := 'email.replied';
    end if;

    update public.emails
    set customer_id = v_customer_id, deal_id = v_deal_id
    where id = NEW.id;

    perform emit_workspace_event(
      NEW.company_id, v_event_type, 'email', 'email', NEW.id::text,
      jsonb_build_object(
        'from_address', NEW.from_address, 'subject', NEW.subject,
        'customer_id', v_customer_id, 'deal_id', v_deal_id,
        'had_pending_followup', v_had_pending_followup
      ),
      NEW.user_id
    );
  exception when others then null;
  end;

  return NEW;
end;
$$;

-- AFTER INSERT only, deliberately: gmail-sync's upsert only INSERTs a row
-- the first time a given (email_account_id, gmail_id) is seen (that unique
-- constraint is what makes sync idempotent already) — a re-sync of the same
-- message hits the ON CONFLICT DO UPDATE branch, which does not re-fire an
-- AFTER INSERT trigger. So this naturally fires exactly once per message,
-- which is exactly the semantics email.received/email.replied need.
create trigger tr_resolve_inbound_email
after insert on public.emails
for each row execute function public.trg_resolve_inbound_email();
