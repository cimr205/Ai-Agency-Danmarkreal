-- Brings the repo in line with production for objects that production
-- changed directly (never committed as migrations). Generated from the
-- production catalog (pg_get_functiondef / pg_policies / pg_get_triggerdef)
-- on 2026-10-23. Against production every statement recreates exactly what
-- is already there.
--
-- 1. Functions where production is ahead of the repo:
--    - has_role / is_company_admin: roles are checked within the caller's
--      own company (repo version honoured a company_admin role from any
--      company); system_admin stays global.
--    - set_company_mode / update_compliance_item: admin must belong to the
--      target company.
--    - join_company_by_code / bootstrap_company_admin: roles are written
--      with company_id.
--    - handle_new_user: no longer inserts a company-less 'employee' role.
--    - transition_quote: accepting a quote marks the linked deal won.
-- 2. RLS on the tables reconstructed in 20261014000000: that migration
--    granted every company member full access (one FOR ALL policy per
--    table). Production uses narrower policies (own rows; admins read).
-- 3. updated_at triggers that production has on four of those tables.

-- ── 1. Functions ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bootstrap_company_admin(_company_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF get_user_company_id(auth.uid()) IS DISTINCT FROM _company_id THEN
    RAISE EXCEPTION 'Not authorized: caller does not belong to this company';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE p.company_id = _company_id AND ur.role = 'company_admin'
  ) THEN
    RAISE EXCEPTION 'This company already has an admin';
  END IF;

  INSERT INTO public.user_roles (user_id, company_id, role)
  VALUES (auth.uid(), _company_id, 'company_admin')
  ON CONFLICT (user_id, company_id, role) WHERE company_id IS NOT NULL DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.profiles (user_id, email, full_name)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NULL)
    )
    ON CONFLICT (lower(email)) DO NOTHING;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role = _role
      and (_role = 'system_admin' or company_id = public.get_user_company_id(_user_id))
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and (
        role = 'system_admin'
        or (role = 'company_admin' and company_id = public.get_user_company_id(_user_id))
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.join_company_by_code(_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_company_id uuid;
  sanitized_code text;
BEGIN
  sanitized_code := upper(trim(_code));

  IF length(sanitized_code) < 4 OR length(sanitized_code) > 20 THEN
    RAISE EXCEPTION 'Invalid code format';
  END IF;

  SELECT id INTO target_company_id FROM public.companies WHERE activation_code = sanitized_code;
  IF target_company_id IS NULL THEN
    RAISE EXCEPTION 'Ugyldig virksomhedskode';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Du tilhører allerede en virksomhed';
  END IF;
  UPDATE public.profiles SET company_id = target_company_id, onboarding_completed = true WHERE user_id = auth.uid();
  INSERT INTO public.user_roles (user_id, company_id, role) VALUES (auth.uid(), target_company_id, 'employee')
    ON CONFLICT (user_id, company_id, role) WHERE company_id IS NOT NULL DO NOTHING;
  INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, description)
  VALUES (auth.uid(), target_company_id, 'employee_joined', 'profile', 'Medarbejder tilsluttet via virksomhedskode');
  RETURN target_company_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_company_mode(_company_id uuid, _mode text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT (is_company_admin(auth.uid()) AND get_user_company_id(auth.uid()) = _company_id) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    UPDATE public.companies SET mode = _mode WHERE id = _company_id;
    RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_quote(p_quote_id uuid, p_target_status text, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.update_compliance_item(_company_id uuid, _item text, _value boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    new_checklist JSONB;
BEGIN
    IF NOT (is_company_admin(auth.uid()) AND get_user_company_id(auth.uid()) = _company_id) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    UPDATE public.companies
    SET compliance_checklist = jsonb_set(compliance_checklist, ARRAY[_item], to_jsonb(_value))
    WHERE id = _company_id
    RETURNING compliance_checklist INTO new_checklist;

    RETURN new_checklist;
END;
$function$;

-- ── 2. RLS policies on reconstructed tables ───────────────────────────────

drop policy if exists "Company members access ai_execution_runs" on public.ai_execution_runs;
drop policy if exists "Company members access capability_usage" on public.capability_usage;
drop policy if exists "Company members access integration_dna" on public.integration_dna;
drop policy if exists "Company members access integration_opportunities" on public.integration_opportunities;
drop policy if exists "Company members access phone_identities" on public.phone_identities;
drop policy if exists "Company members access telephony_connections" on public.telephony_connections;
drop policy if exists "Company members access telnyx_config" on public.telnyx_config;
drop policy if exists "Company members access telnyx_credentials" on public.telnyx_credentials;
drop policy if exists "Company members access workspace_ai_preferences" on public.workspace_ai_preferences;
drop policy if exists "Company members access workspace_capabilities" on public.workspace_capabilities;
drop policy if exists "Company members access call_sessions" on public.call_sessions;

drop policy if exists "Members view own company execution runs" on public.ai_execution_runs;
create policy "Members view own company execution runs" on public.ai_execution_runs
  for select to authenticated
  using ((company_id = get_user_company_id(auth.uid())));

drop policy if exists "Members view own company execution steps" on public.ai_execution_steps;
create policy "Members view own company execution steps" on public.ai_execution_steps
  for select to authenticated
  using ((execution_run_id IN ( SELECT ai_execution_runs.id
   FROM ai_execution_runs
  WHERE (ai_execution_runs.company_id = get_user_company_id(auth.uid())))));

drop policy if exists "Admins can view company call sessions" on public.call_sessions;
create policy "Admins can view company call sessions" on public.call_sessions
  for select to public
  using (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));

drop policy if exists "Users manage their own call sessions" on public.call_sessions;
create policy "Users manage their own call sessions" on public.call_sessions
  for all to public
  using (((company_id = get_user_company_id(auth.uid())) AND (user_id = auth.uid())))
  with check (((company_id = get_user_company_id(auth.uid())) AND (user_id = auth.uid())));

drop policy if exists "Members can view company capability usage" on public.capability_usage;
create policy "Members can view company capability usage" on public.capability_usage
  for select to public
  using ((company_id = get_user_company_id(auth.uid())));

drop policy if exists "Members can view company DNA" on public.integration_dna;
create policy "Members can view company DNA" on public.integration_dna
  for select to public
  using ((company_id = get_user_company_id(auth.uid())));

drop policy if exists "Members can dismiss or activate company opportunities" on public.integration_opportunities;
create policy "Members can dismiss or activate company opportunities" on public.integration_opportunities
  for update to public
  using ((company_id = get_user_company_id(auth.uid())))
  with check ((company_id = get_user_company_id(auth.uid())));

drop policy if exists "Members can view company opportunities" on public.integration_opportunities;
create policy "Members can view company opportunities" on public.integration_opportunities
  for select to public
  using ((company_id = get_user_company_id(auth.uid())));

drop policy if exists "Admins can view company phone identities" on public.phone_identities;
create policy "Admins can view company phone identities" on public.phone_identities
  for select to public
  using (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));

drop policy if exists "Users manage their own phone identities" on public.phone_identities;
create policy "Users manage their own phone identities" on public.phone_identities
  for all to public
  using (((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid()))))
  with check (((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid()))));

drop policy if exists "Admins can view company telephony connections" on public.telephony_connections;
create policy "Admins can view company telephony connections" on public.telephony_connections
  for select to public
  using (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));

drop policy if exists "Users manage their own telephony connections" on public.telephony_connections;
create policy "Users manage their own telephony connections" on public.telephony_connections
  for all to public
  using (((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid()))))
  with check (((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid()))));

drop policy if exists "Admins manage telnyx config" on public.telnyx_config;
create policy "Admins manage telnyx config" on public.telnyx_config
  for all to public
  using (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())))
  with check (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));

drop policy if exists "Company members can view telnyx config" on public.telnyx_config;
create policy "Company members can view telnyx config" on public.telnyx_config
  for select to public
  using ((company_id = get_user_company_id(auth.uid())));

drop policy if exists "Users manage their own telnyx credential" on public.telnyx_credentials;
create policy "Users manage their own telnyx credential" on public.telnyx_credentials
  for all to public
  using (((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid()))))
  with check (((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid()))));

drop policy if exists "Admins manage own company ai preferences" on public.workspace_ai_preferences;
create policy "Admins manage own company ai preferences" on public.workspace_ai_preferences
  for all to authenticated
  using (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())))
  with check (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));

drop policy if exists "Members view own company ai preferences" on public.workspace_ai_preferences;
create policy "Members view own company ai preferences" on public.workspace_ai_preferences
  for select to authenticated
  using ((company_id = get_user_company_id(auth.uid())));

drop policy if exists "Members can view company capabilities" on public.workspace_capabilities;
create policy "Members can view company capabilities" on public.workspace_capabilities
  for select to public
  using ((company_id = get_user_company_id(auth.uid())));

-- ── 3. updated_at triggers ────────────────────────────────────────────────

drop trigger if exists set_call_sessions_updated_at on public.call_sessions;
CREATE TRIGGER set_call_sessions_updated_at BEFORE UPDATE ON public.call_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

drop trigger if exists set_phone_identities_updated_at on public.phone_identities;
CREATE TRIGGER set_phone_identities_updated_at BEFORE UPDATE ON public.phone_identities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

drop trigger if exists set_telephony_connections_updated_at on public.telephony_connections;
CREATE TRIGGER set_telephony_connections_updated_at BEFORE UPDATE ON public.telephony_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

drop trigger if exists set_telnyx_config_updated_at on public.telnyx_config;
CREATE TRIGGER set_telnyx_config_updated_at BEFORE UPDATE ON public.telnyx_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
