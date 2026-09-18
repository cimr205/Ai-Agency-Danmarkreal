-- Reconstructed from live production (supabase_migrations.schema_migrations).
-- This migration was applied directly to the database and was missing from
-- git history until this audit found it via `supabase migration list --linked`.
-- Content is verbatim from the live `statements` column; not authored here.

alter table public.emails
  add column if not exists direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  add column if not exists message_id_header text,
  add column if not exists in_reply_to_header text,
  add column if not exists references_header text;

comment on column public.emails.direction is
  'inbound = synced from Gmail via gmail-sync; outbound = sent via gmail-send and recorded for thread-continuity purposes.';
comment on column public.emails.message_id_header is
  'RFC 5322 Message-ID header of this specific message (e.g. "<abc@mail.gmail.com>"). Globally unique per message.';
comment on column public.emails.in_reply_to_header is
  'RFC 5322 In-Reply-To header, when present on an inbound message — the Message-ID this message is a direct reply to.';

create index if not exists emails_thread_idx on public.emails (email_account_id, thread_id) where thread_id is not null;
create index if not exists emails_message_id_header_idx on public.emails (email_account_id, message_id_header) where message_id_header is not null;

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
  v_thread_customer_count integer;
  v_thread_customer_id uuid;
  v_deal_id uuid;
  v_deal_count integer;
  v_had_pending_followup boolean := false;
  v_is_reply boolean := false;
  v_event_type text := 'email.received';
begin
  if NEW.direction <> 'inbound' then
    return NEW;
  end if;

  begin
    if NEW.thread_id is not null then
      select exists (
        select 1 from public.emails e
        where e.email_account_id = NEW.email_account_id
          and e.thread_id = NEW.thread_id
          and e.direction = 'outbound'
          and e.id <> NEW.id
      ) into v_is_reply;

      select count(distinct e.customer_id), min(e.customer_id) into v_thread_customer_count, v_thread_customer_id
      from public.emails e
      where e.email_account_id = NEW.email_account_id
        and e.thread_id = NEW.thread_id
        and e.customer_id is not null
        and e.id <> NEW.id;

      if v_thread_customer_count = 1 then
        v_customer_id := v_thread_customer_id;
      end if;
    end if;

    if v_customer_id is null then
      v_norm_from := nullif(lower(trim(NEW.from_address)), '');
      if v_norm_from is not null then
        select count(*) into v_customer_count
        from public.customers c
        where c.company_id = NEW.company_id and c.normalized_email = v_norm_from;

        if v_customer_count = 1 then
          select c.id, (c.next_followup_at is not null) into v_customer_id, v_had_pending_followup
          from public.customers c
          where c.company_id = NEW.company_id and c.normalized_email = v_norm_from;
        end if;
      end if;
    end if;

    if v_customer_id is not null then
      if v_is_reply then
        update public.customers
        set next_followup_at = null, last_touched_at = now()
        where id = v_customer_id;
      else
        update public.customers set last_touched_at = now() where id = v_customer_id;
      end if;

      select count(*) into v_deal_count
      from public.deals d
      where d.customer_id = v_customer_id and d.stage not in ('won', 'lost');

      if v_deal_count = 1 then
        select d.id into v_deal_id
        from public.deals d
        where d.customer_id = v_customer_id and d.stage not in ('won', 'lost');
      end if;
    end if;

    if NEW.from_address is not null then
      update public.bulk_email_recipients
      set replied_at = now()
      where company_id = NEW.company_id
        and lower(trim(email)) = lower(trim(NEW.from_address))
        and replied_at is null;
      if found then
        v_is_reply := true;
      end if;
    end if;

    v_event_type := case when v_is_reply then 'email.replied' else 'email.received' end;

    update public.emails
    set customer_id = v_customer_id, deal_id = v_deal_id
    where id = NEW.id;

    perform emit_workspace_event(
      NEW.company_id, v_event_type, 'email', 'email', NEW.id::text,
      jsonb_build_object(
        'from_address', NEW.from_address, 'subject', NEW.subject,
        'customer_id', v_customer_id, 'deal_id', v_deal_id,
        'had_pending_followup', v_had_pending_followup,
        'thread_continuity', v_is_reply
      ),
      NEW.user_id
    );
  exception when others then null;
  end;

  return NEW;
end;
$$;
