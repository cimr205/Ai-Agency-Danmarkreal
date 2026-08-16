-- Baseline: functions (excludes pgmq/pg_cron/pg_net/vault-dependent functions, not present on target - see 51_functions_pgmq_skipped.sql)
-- Consolidated from schema-recon reconstruction, verified applied against vbxlpxhvojlaisxcipyh

-- Functions reconstructed from source DB (public schema)
-- NOTE: email_queue_dispatch, email_queue_wake, delete_email, enqueue_email,
-- move_to_dlq, read_email_batch depend on pgmq/pg_cron/pg_net/supabase_vault
-- extensions and a vault secret 'email_queue_service_role_key'. These are
-- created as-is but WILL NOT FUNCTION on target unless those extensions are
-- enabled and the vault secret is configured. Flagged in final report.

CREATE OR REPLACE FUNCTION public.accept_invitation(invite_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv public.invitations%ROWTYPE;
  caller_email text;
BEGIN
  SELECT * INTO inv FROM public.invitations WHERE token = invite_token LIMIT 1;

  IF inv.id IS NULL THEN
    RAISE EXCEPTION 'Invalid invitation token';
  END IF;

  IF inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is no longer pending (status: %)', inv.status;
  END IF;

  IF inv.expires_at < now() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = inv.id;
    RAISE EXCEPTION 'Invitation has expired';
  END IF;

  -- Verify email matches
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  IF lower(caller_email) <> lower(inv.email) THEN
    RAISE EXCEPTION 'This invitation was sent to a different email address';
  END IF;

  -- Check if user already belongs to a company
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'You already belong to a company';
  END IF;

  -- Update profile with company_id and mark onboarding complete
  UPDATE public.profiles
  SET company_id = inv.company_id, onboarding_completed = true
  WHERE user_id = auth.uid();

  -- Set role
  INSERT INTO public.user_roles(user_id, role)
  VALUES (auth.uid(), inv.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Mark invitation as accepted
  UPDATE public.invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = inv.id;

  RETURN inv.company_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.activate_company(_company_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    checklist JSONB;
    all_complete BOOLEAN;
BEGIN
    IF NOT is_company_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    SELECT compliance_checklist INTO checklist
    FROM public.companies WHERE id = _company_id;

    all_complete := (
        (checklist->>'company_info')::boolean AND
        (checklist->>'admin_setup')::boolean AND
        (checklist->>'roles_defined')::boolean
    );

    IF all_complete THEN
        UPDATE public.companies
        SET status = 'active', mode = 'live'
        WHERE id = _company_id;
        RETURN TRUE;
    ELSE
        RETURN FALSE;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_create_payment_on_invoice_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only fire when status changes TO 'paid'
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status != 'paid') THEN
    -- Check if a payment already exists for this invoice
    IF NOT EXISTS (SELECT 1 FROM public.payments WHERE invoice_id = NEW.id AND status = 'completed') THEN
      INSERT INTO public.payments (company_id, invoice_id, amount, status, payment_method, created_by, paid_at)
      VALUES (NEW.company_id, NEW.id, NEW.amount, 'completed', 'bank_transfer', NEW.created_by, COALESCE(NEW.paid_at, now()));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_mark_invoice_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  total_paid numeric;
  invoice_amount numeric;
BEGIN
  -- Calculate total payments for the invoice
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM public.payments
  WHERE invoice_id = NEW.invoice_id AND status = 'completed';

  -- Get invoice amount
  SELECT amount INTO invoice_amount
  FROM public.invoices
  WHERE id = NEW.invoice_id;

  -- If fully paid, update invoice status
  IF total_paid >= invoice_amount THEN
    UPDATE public.invoices
    SET status = 'paid', paid_at = now()
    WHERE id = NEW.invoice_id AND status != 'paid';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_contact_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE recent_count integer;
BEGIN
  SELECT COUNT(*) INTO recent_count FROM public.contact_submissions
  WHERE lower(email) = lower(NEW.email) AND created_at > now() - interval '1 hour';
  IF recent_count >= 3 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Please try again later.';
  END IF;
  SELECT COUNT(*) INTO recent_count FROM public.contact_submissions
  WHERE created_at > now() - interval '1 hour';
  IF recent_count >= 30 THEN
    RAISE EXCEPTION 'Service temporarily unavailable. Please try again later.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_owner_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    owner_count integer;
    user_company uuid;
BEGIN
    IF NEW.role = 'company_admin' THEN
        SELECT company_id INTO user_company FROM public.profiles WHERE user_id = NEW.user_id;
        IF user_company IS NOT NULL THEN
            SELECT COUNT(*) INTO owner_count
            FROM public.user_roles ur
            JOIN public.profiles p ON p.user_id = ur.user_id
            WHERE p.company_id = user_company AND ur.role = 'company_admin';

            IF owner_count >= 5 THEN
                RAISE EXCEPTION 'En virksomhed kan maksimalt have 5 ejere/direktører';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_usage_quota(_company_id uuid, _quota_type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT used_count < max_count
     FROM public.usage_quotas
     WHERE company_id = _company_id
       AND quota_type = _quota_type
       AND period_start = date_trunc('month', now())),
    true
  );
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_old_sessions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE deleted_count integer;
BEGIN
  DELETE FROM public.user_sessions WHERE ended_at IS NOT NULL AND ended_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  UPDATE public.user_sessions SET ended_at = started_at + interval '8 hours', duration_seconds = 28800
  WHERE ended_at IS NULL AND started_at < now() - interval '24 hours';
  RETURN deleted_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_invitation(invite_email text, invite_role app_role DEFAULT 'employee'::app_role)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t text;
  cid uuid;
BEGIN
  -- Check caller is company_admin or system_admin
  IF NOT is_company_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to invite';
  END IF;

  SELECT company_id INTO cid FROM public.profiles WHERE user_id = auth.uid();
  IF cid IS NULL THEN
    RAISE EXCEPTION 'No company associated with your profile';
  END IF;

  -- Check if there's already a pending invitation for this email in this company
  IF EXISTS (
    SELECT 1 FROM public.invitations
    WHERE company_id = cid AND lower(email) = lower(invite_email) AND status = 'pending' AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'A pending invitation already exists for this email';
  END IF;

  -- Generate secure token
  t := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.invitations(company_id, email, role, token, invited_by, expires_at)
  VALUES (cid, lower(invite_email), invite_role, t, auth.uid(), now() + interval '7 days');

  RETURN t;
END;
$function$;

CREATE OR REPLACE FUNCTION public.emit_workspace_event(_company_id uuid, _type text, _source text, _entity_type text, _entity_id text, _payload jsonb, _actor uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.workspace_events(company_id, type, source_module, entity_type, entity_id, payload, actor_user_id)
  VALUES (_company_id, _type, _source, _entity_type, _entity_id, COALESCE(_payload, '{}'::jsonb), _actor)
  RETURNING id INTO new_id;
  RETURN new_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.generate_activation_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    new_code TEXT;
    code_exists BOOLEAN;
BEGIN
    LOOP
        new_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
        SELECT EXISTS(
            SELECT 1 FROM public.companies WHERE activation_code = new_code
        ) INTO code_exists;
        EXIT WHEN NOT code_exists;
    END LOOP;
    RETURN new_code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_employee_id(company_prefix text DEFAULT 'AAD'::text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    new_id TEXT;
    id_exists BOOLEAN;
BEGIN
    LOOP
        new_id := company_prefix || '-' ||
                  upper(substring(md5(random()::text) from 1 for 5));
        SELECT EXISTS(
            SELECT 1 FROM public.employee_profiles WHERE employee_id = new_id
        ) INTO id_exists;
        EXIT WHEN NOT id_exists;
    END LOOP;
    RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_invoice_number(_company_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_year text;
  max_seq integer;
  new_number text;
BEGIN
  current_year := to_char(now(), 'YYYY');

  SELECT COALESCE(MAX(
    CASE
      WHEN invoice_number ~ ('^' || current_year || '-\d+$')
      THEN substring(invoice_number from '\d+$')::integer
      ELSE 0
    END
  ), 0) INTO max_seq
  FROM public.invoices
  WHERE company_id = _company_id
    AND invoice_number LIKE current_year || '-%';

  new_number := current_year || '-' || lpad((max_seq + 1)::text, 4, '0');
  RETURN new_number;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_active_webhooks_for_event(_company_id uuid, _event text)
 RETURNS TABLE(id uuid, url text, secret_key text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT w.id, w.url, w.secret_key
  FROM public.webhooks w
  WHERE w.company_id = _company_id
    AND w.event = _event
    AND w.is_active = true;
$function$;

CREATE OR REPLACE FUNCTION public.get_company_for_user(_company_id uuid)
 RETURNS TABLE(id uuid, name text, cvr text, address text, phone text, email text, website text, logo_url text, industry text, company_size text, status text, mode text, onboarding_completed boolean, onboarding_step integer, compliance_checklist jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, trial_ends_at timestamp with time zone, seat_limit_trial integer, purchased_seats integer, subscription_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF get_user_company_id(auth.uid()) <> _company_id THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY SELECT c.id, c.name, c.cvr, c.address, c.phone, c.email, c.website,
    c.logo_url, c.industry, c.company_size, c.status, c.mode,
    c.onboarding_completed, c.onboarding_step, c.compliance_checklist,
    c.created_at, c.updated_at, c.trial_ends_at, c.seat_limit_trial, c.purchased_seats, c.subscription_status
  FROM public.companies c WHERE c.id = _company_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_company_safe(_company_id uuid)
 RETURNS TABLE(id uuid, name text, logo_url text, industry text, company_size text, status text, mode text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.id, c.name, c.logo_url, c.industry, c.company_size, c.status, c.mode
  FROM public.companies c
  WHERE c.id = _company_id
$function$;

CREATE OR REPLACE FUNCTION public.get_company_status(_company_id uuid)
 RETURNS TABLE(status text, mode text, compliance_checklist jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT c.status, c.mode, c.compliance_checklist
    FROM public.companies c
    WHERE c.id = _company_id
$function$;

CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT company_id
  FROM public.profiles
  WHERE user_id = _user_id
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
    );

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'employee');

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;

CREATE OR REPLACE FUNCTION public.increment_campaign_opens(p_campaign_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE bulk_email_campaigns
  SET total_opened = total_opened + 1
  WHERE id = p_campaign_id;
$function$;

CREATE OR REPLACE FUNCTION public.increment_campaign_replies(p_campaign_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  UPDATE public.bulk_email_campaigns
  SET total_replied = total_replied + 1
  WHERE id = p_campaign_id;
$function$;

CREATE OR REPLACE FUNCTION public.increment_campaign_unsubs(p_campaign_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE bulk_email_campaigns
  SET total_unsubscribed = total_unsubscribed + 1
  WHERE id = p_campaign_id;
$function$;

CREATE OR REPLACE FUNCTION public.increment_usage_quota(_company_id uuid, _quota_type text, _amount integer DEFAULT 1)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_used INTEGER;
  current_max INTEGER;
  period_s TIMESTAMPTZ := date_trunc('month', now());
BEGIN
  INSERT INTO public.usage_quotas (company_id, quota_type, used_count, max_count, period_start, period_end)
  VALUES (_company_id, _quota_type, _amount, 1000, period_s, period_s + interval '1 month')
  ON CONFLICT (company_id, quota_type, period_start)
  DO UPDATE SET used_count = usage_quotas.used_count + _amount, updated_at = now()
  RETURNING used_count, max_count INTO current_used, current_max;

  RETURN current_used <= current_max;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('system_admin', 'company_admin')
  )
$function$;

CREATE OR REPLACE FUNCTION public.issue_mcp_token(_name text)
 RETURNS TABLE(id uuid, token text, prefix text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cid uuid;
  raw text;
  full_token text;
  pfx text;
  new_id uuid;
BEGIN
  cid := get_user_company_id(auth.uid());
  IF cid IS NULL THEN RAISE EXCEPTION 'No company'; END IF;

  raw := encode(gen_random_bytes(32), 'hex');
  full_token := 'mcp_' || raw;
  pfx := substring(full_token from 1 for 12);

  INSERT INTO public.mcp_tokens (company_id, user_id, name, token_hash, token_prefix)
  VALUES (cid, auth.uid(), COALESCE(NULLIF(trim(_name),''), 'AI Client'),
          encode(digest(full_token, 'sha256'), 'hex'), pfx)
  RETURNING mcp_tokens.id INTO new_id;

  RETURN QUERY SELECT new_id, full_token, pfx;
END;
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
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'employee') ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, description)
  VALUES (auth.uid(), target_company_id, 'employee_joined', 'profile', 'Medarbejder tilsluttet via virksomhedskode');
  RETURN target_company_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_activity(_user_id uuid, _company_id uuid, _action_type text, _entity_type text DEFAULT NULL::text, _entity_id text DEFAULT NULL::text, _description text DEFAULT NULL::text, _metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description, metadata)
    VALUES (_user_id, _company_id, _action_type, _entity_type, _entity_id, _description, _metadata);
END;
$function$;

CREATE OR REPLACE FUNCTION public.regenerate_activation_code(_company_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    new_code TEXT;
BEGIN
    IF NOT (
        get_user_company_id(auth.uid()) = _company_id
        AND has_role(auth.uid(), 'company_admin')
    ) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    new_code := generate_activation_code();

    UPDATE public.companies
    SET activation_code = new_code
    WHERE id = _company_id;

    RETURN new_code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_mcp_token(_token text)
 RETURNS TABLE(company_id uuid, user_id uuid, token_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  h text;
BEGIN
  h := encode(digest(_token, 'sha256'), 'hex');
  RETURN QUERY
    SELECT t.company_id, t.user_id, t.id
    FROM public.mcp_tokens t
    WHERE t.token_hash = h AND t.revoked_at IS NULL
    LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_invitation(invitation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_company_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.invitations
  SET status = 'revoked'
  WHERE id = invitation_id
    AND company_id = get_user_company_id(auth.uid())
    AND status = 'pending';

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_company_activation_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.activation_code IS NULL THEN
        NEW.activation_code := generate_activation_code();
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_company_mode(_company_id uuid, _mode text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT is_company_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    UPDATE public.companies SET mode = _mode WHERE id = _company_id;
    RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_emit_deal_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM emit_workspace_event(NEW.company_id, 'deal.created', 'crm', 'deal', NEW.id::text,
        jsonb_build_object('title', NEW.title, 'value', NEW.value, 'stage', NEW.stage), COALESCE(auth.uid(), NEW.created_by));
    ELSIF TG_OP = 'UPDATE' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
      PERFORM emit_workspace_event(NEW.company_id,
        CASE WHEN NEW.stage = 'won' THEN 'deal.won'
             WHEN NEW.stage = 'lost' THEN 'deal.lost'
             ELSE 'deal.stage_changed' END,
        'crm', 'deal', NEW.id::text,
        jsonb_build_object('title', NEW.title, 'value', NEW.value, 'from', OLD.stage, 'to', NEW.stage), auth.uid());
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.trg_emit_invoice_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM emit_workspace_event(NEW.company_id, 'invoice.created', 'finance', 'invoice', NEW.id::text,
        jsonb_build_object('number', NEW.invoice_number, 'amount', NEW.amount, 'status', NEW.status::text), COALESCE(auth.uid(), NEW.created_by));
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM emit_workspace_event(NEW.company_id,
        CASE WHEN NEW.status::text = 'paid' THEN 'invoice.paid' ELSE 'invoice.status_changed' END,
        'finance', 'invoice', NEW.id::text,
        jsonb_build_object('number', NEW.invoice_number, 'amount', NEW.amount, 'from', OLD.status::text, 'to', NEW.status::text), auth.uid());
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.trg_emit_lead_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM emit_workspace_event(NEW.company_id, 'lead.created', 'crm', 'lead', NEW.id::text,
        jsonb_build_object('name', NEW.name, 'email', NEW.email, 'company', NEW.company_name, 'score', NEW.score, 'status', NEW.status::text),
        COALESCE(auth.uid(), NEW.created_by));
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM emit_workspace_event(NEW.company_id, 'lead.status_changed', 'crm', 'lead', NEW.id::text,
        jsonb_build_object('from', OLD.status::text, 'to', NEW.status::text, 'name', NEW.name), auth.uid());
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.trg_emit_task_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      PERFORM emit_workspace_event(NEW.company_id, 'task.created', 'productivity', 'task', NEW.id::text,
        jsonb_build_object('title', NEW.title, 'priority', NEW.priority, 'assigned_to', NEW.assigned_to), COALESCE(auth.uid(), NEW.created_by));
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status::text = 'completed' THEN
      PERFORM emit_workspace_event(NEW.company_id, 'task.completed', 'productivity', 'task', NEW.id::text,
        jsonb_build_object('title', NEW.title), auth.uid());
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.trigger_log_ai_generation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description, metadata)
        VALUES (
            NEW.user_id,
            NEW.company_id,
            'ai_generation_started',
            'ai_generation',
            NEW.id::text,
            'AI ' || NEW.generation_type || ' generation startet',
            jsonb_build_object('prompt', left(NEW.prompt, 100), 'model', NEW.model_used)
        );
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
        INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description)
        VALUES (
            NEW.user_id,
            NEW.company_id,
            'ai_generation_completed',
            'ai_generation',
            NEW.id::text,
            'AI ' || NEW.generation_type || ' generation fuldført'
        );
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'failed' THEN
        INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description)
        VALUES (
            NEW.user_id,
            NEW.company_id,
            'ai_generation_failed',
            'ai_generation',
            NEW.id::text,
            'AI ' || NEW.generation_type || ' generation fejlede'
        );
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_log_company_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description)
    VALUES (
        COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
        NEW.id,
        'company_created',
        'company',
        NEW.id::text,
        'Virksomhed oprettet: ' || NEW.name
    );
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_log_deal_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description)
        VALUES (NEW.created_by, NEW.company_id, 'deal_created', 'deal', NEW.id::text, 'Deal oprettet: ' || NEW.title);
    ELSIF TG_OP = 'UPDATE' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
        INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description, metadata)
        VALUES (
            COALESCE(auth.uid(), NEW.created_by),
            NEW.company_id,
            'deal_updated',
            'deal',
            NEW.id::text,
            'Deal stage ændret: ' || NEW.title,
            jsonb_build_object('old_stage', OLD.stage::text, 'new_stage', NEW.stage::text)
        );
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_log_employee_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description)
    VALUES (
        COALESCE(NEW.created_by, auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
        NEW.company_id,
        'employee_created',
        'employee',
        NEW.id::text,
        'Medarbejder oprettet: ' || NEW.full_name
    );
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_log_invoice_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description)
    VALUES (NEW.created_by, NEW.company_id, 'invoice_created', 'invoice', NEW.id::text, 'Faktura oprettet: ' || NEW.invoice_number);
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_log_lead_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description)
        VALUES (NEW.created_by, NEW.company_id, 'lead_created', 'lead', NEW.id::text, 'Lead oprettet: ' || NEW.name);
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description, metadata)
        VALUES (
            COALESCE(auth.uid(), NEW.created_by),
            NEW.company_id,
            'lead_updated',
            'lead',
            NEW.id::text,
            'Lead status ændret: ' || NEW.name,
            jsonb_build_object('old_status', OLD.status::text, 'new_status', NEW.status::text)
        );
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_log_meta_connection()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description)
        VALUES (
            COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
            NEW.company_id,
            'integration_connected',
            'meta_connection',
            NEW.id::text,
            'Meta Ads forbundet'
        );
    ELSIF TG_OP = 'UPDATE' AND NEW.status = 'disconnected' THEN
        INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description)
        VALUES (
            COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
            NEW.company_id,
            'integration_disconnected',
            'meta_connection',
            NEW.id::text,
            'Meta Ads afbrudt'
        );
    END IF;
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_log_task_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description)
        VALUES (NEW.created_by, NEW.company_id, 'task_created', 'task', NEW.id::text, 'Opgave oprettet: ' || NEW.title);
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.activity_logs (user_id, company_id, action_type, entity_type, entity_id, description, metadata)
        VALUES (
            COALESCE(auth.uid(), NEW.created_by),
            NEW.company_id,
            'task_updated',
            'task',
            NEW.id::text,
            'Opgave status ændret: ' || NEW.title,
            jsonb_build_object('old_status', OLD.status::text, 'new_status', NEW.status::text)
        );
    END IF;
    RETURN NEW;
END;
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
    IF NOT is_company_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    UPDATE public.companies
    SET compliance_checklist = jsonb_set(compliance_checklist, ARRAY[_item], to_jsonb(_value))
    WHERE id = _company_id
    RETURNING compliance_checklist INTO new_checklist;

    RETURN new_checklist;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_lead_touched()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.last_touched_at = now();
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_webhook_counters(_webhook_id uuid, _success boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _success THEN
    UPDATE public.webhooks SET success_count = success_count + 1, last_triggered_at = now() WHERE id = _webhook_id;
  ELSE
    UPDATE public.webhooks SET fail_count = fail_count + 1, last_triggered_at = now() WHERE id = _webhook_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_activation_code(_code text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT id FROM public.companies WHERE activation_code = upper(_code)
$function$;
