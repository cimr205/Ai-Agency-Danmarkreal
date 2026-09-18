-- Reconstructed from live production (supabase_migrations.schema_migrations).
-- This migration was applied directly to the database and was missing from
-- git history until this audit found it via `supabase migration list --linked`.
-- Content is verbatim from the live `statements` column; not authored here.

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

    select count(*) into v_customer_count
    from public.customers c
    where c.company_id = NEW.company_id and c.normalized_email = v_norm_from;

    if v_customer_count = 1 then
      select c.id, (c.next_followup_at is not null) into v_customer_id, v_had_pending_followup
      from public.customers c
      where c.company_id = NEW.company_id and c.normalized_email = v_norm_from;

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

create trigger tr_resolve_inbound_email
after insert on public.emails
for each row execute function public.trg_resolve_inbound_email();
