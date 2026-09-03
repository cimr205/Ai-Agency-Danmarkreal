-- Masterprompt §25 "QUOTE ACCEPTED" automation: when a quote linked to a
-- deal transitions to 'accepted', move that deal to 'won' automatically
-- instead of leaving the user to do it by hand in a second place. Only
-- the deal-stage part is built here — "create project"/"create standard
-- tasks" are deferred, there is no projects table yet (confirmed gap,
-- separate larger schema decision).
create or replace function public.transition_quote(
  p_quote_id uuid,
  p_target_status text,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := public.get_user_company_id(auth.uid());
  v_quote public.quotes%rowtype;
  v_target text := lower(trim(p_target_status));
begin
  if auth.uid() is null or v_company_id is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into v_quote from public.quotes where id = p_quote_id and company_id = v_company_id for update;
  if not found then raise exception 'Quote not found' using errcode = 'P0002'; end if;
  if p_expected_version is not null and v_quote.version <> p_expected_version then
    raise exception 'Quote was modified by another user' using errcode = '40001';
  end if;
  if not (
    (v_quote.status = 'draft' and v_target in ('sent','cancelled')) or
    (v_quote.status = 'sent' and v_target in ('accepted','rejected','expired','cancelled')) or
    (v_quote.status = v_target)
  ) then raise exception 'Invalid quote transition: % -> %', v_quote.status, v_target using errcode = '55000'; end if;

  update public.quotes set status = v_target,
    sent_at = case when v_target = 'sent' then coalesce(sent_at, now()) else sent_at end,
    accepted_at = case when v_target = 'accepted' then coalesce(accepted_at, now()) else accepted_at end,
    rejected_at = case when v_target = 'rejected' then coalesce(rejected_at, now()) else rejected_at end,
    expired_at = case when v_target = 'expired' then coalesce(expired_at, now()) else expired_at end,
    version = case when status = v_target then version else version + 1 end,
    updated_at = now()
  where id = p_quote_id;

  if v_target = 'accepted' and v_quote.status <> 'accepted' and v_quote.deal_id is not null then
    update public.deals set stage = 'won', updated_at = now()
    where id = v_quote.deal_id and company_id = v_company_id and stage not in ('won', 'lost');
  end if;

  return jsonb_build_object('quote_id', p_quote_id, 'status', v_target,
    'idempotent_replay', v_quote.status = v_target);
end;
$$;
