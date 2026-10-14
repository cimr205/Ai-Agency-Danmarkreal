-- Found during P1 permission-matrix adversarial testing: the 'readonly'
-- role is a real, assignable role (offered in AdminUsers.tsx and
-- InvitationsPage.tsx as a selectable permission level) but is referenced
-- by ZERO RLS policies or RPC functions anywhere in the schema (confirmed
-- by grepping every policy and function body). Live-verified: a test user
-- invited with role='readonly' could freely INSERT and DELETE rows in
-- customers and tasks -- identical access to a normal employee. A company
-- admin who assigns someone "readonly" (e.g. an external bookkeeper or
-- auditor) gets a false sense of restriction; the role currently does
-- nothing.
--
-- Fix: a single reusable trigger function that blocks writes for callers
-- holding the 'readonly' role, attached to the real business-data tables
-- a readonly designation should sensibly cover. Deliberately NOT attached
-- to self-service/personal tables where blocking would be a functional
-- regression, not a security fix: profiles (own profile), notifications
-- and user_sessions (own notification/session state), mcp_tokens and
-- saved_lead_filters/lead_gen_saved_searches (personal, not shared
-- business data), user_roles and invitations (already admin-gated
-- separately), workspace_ai_preferences (already admin-gated), and
-- leave_requests/data_deletion_requests (personal HR/GDPR self-service
-- actions every employee should retain regardless of data-access level).
--
-- Checked production data first: 0 users currently hold the 'readonly'
-- role, so this closes a real gap without touching any live workflow.

CREATE OR REPLACE FUNCTION public.is_readonly(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'readonly'
  )
$function$;

CREATE OR REPLACE FUNCTION public.block_readonly_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF public.is_readonly(auth.uid()) THEN
    RAISE EXCEPTION 'Read-only role cannot modify data' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.ai_generations;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.ai_generations FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.ai_operating_rules;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.ai_operating_rules FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.attendance_logs;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.attendance_logs FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.bulk_email_campaigns;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.bulk_email_campaigns FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.bulk_email_recipients;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.bulk_email_recipients FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.calendar_events;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.campaign_assets;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.campaign_assets FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.cold_caller_usage;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.cold_caller_usage FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.customers;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.cvr_companies;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.cvr_companies FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.deals;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.dinero_connections;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.dinero_connections FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.economic_connections;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.economic_connections FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.email_accounts;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.email_accounts FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.email_suppression_list;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.email_suppression_list FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.emails;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.emails FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.employee_profiles;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.employee_profiles FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.event_subscriptions;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.event_subscriptions FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.icp_profiles;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.icp_profiles FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.icp_search_jobs;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.icp_search_jobs FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.invoices;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.lead_folders;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.lead_folders FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.lead_gen_results;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.lead_gen_results FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.lead_gen_sessions;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.lead_gen_sessions FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.lead_icp_scores;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.lead_icp_scores FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.leads;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.messages;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.messages FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.meta_ad_accounts;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.meta_ad_accounts FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.meta_connections;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.meta_connections FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.payments;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.payroll;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.payroll FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.phone_provisions;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.phone_provisions FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.pipeline_stages;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.pipeline_stages FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.power_dialer_calls;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.power_dialer_calls FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.recruitment;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.recruitment FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.subscriptions;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.tasks;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.teams;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.twilio_accounts;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.twilio_accounts FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.webhook_logs;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.webhook_logs FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.webhooks;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.webhooks FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.work_schedules;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.work_schedules FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.workflows;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.workflows FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();

DROP TRIGGER IF EXISTS trg_block_readonly_write ON public.workforce_settings;
CREATE TRIGGER trg_block_readonly_write BEFORE INSERT OR UPDATE OR DELETE ON public.workforce_settings FOR EACH ROW EXECUTE FUNCTION public.block_readonly_write();
