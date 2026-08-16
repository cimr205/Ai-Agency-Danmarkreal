-- Baseline: row level security policies
-- Consolidated from schema-recon reconstruction, verified applied against vbxlpxhvojlaisxcipyh

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autopilot_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_email_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cold_caller_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cvr_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.icp_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.icp_search_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_gen_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_gen_saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_gen_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_icp_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.openai_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_provisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_lead_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.twilio_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_call_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voice_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workforce_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins can view company activity" ON public.activity_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Service can insert activity" ON public.activity_logs AS PERMISSIVE FOR INSERT TO service_role
  WITH CHECK (true);
CREATE POLICY "System admins can view all activity" ON public.activity_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Users can insert activity logs" ON public.activity_logs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can log their own activity" ON public.activity_logs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can view activity in their company" ON public.activity_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Admins can delete generations" ON public.ai_generations AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "System admins can view all generations" ON public.ai_generations AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Users can create generations" ON public.ai_generations AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (user_id = auth.uid())));
CREATE POLICY "Users can update own generations" ON public.ai_generations AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can view company generations" ON public.ai_generations AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Employees can check in themselves" ON public.attendance_logs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (employee_profile_id IN ( SELECT employee_profiles.id
   FROM employee_profiles
  WHERE (employee_profiles.user_id = auth.uid())))));
CREATE POLICY "Employees can check out themselves" ON public.attendance_logs AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((employee_profile_id IN ( SELECT employee_profiles.id
   FROM employee_profiles
  WHERE (employee_profiles.user_id = auth.uid()))));
CREATE POLICY "Employees can view company attendance" ON public.attendance_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can create autopilot actions in own company" ON public.autopilot_actions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (user_id = auth.uid())));
CREATE POLICY "Users can update own autopilot actions" ON public.autopilot_actions AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can view own company autopilot actions" ON public.autopilot_actions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can create campaigns for own company" ON public.bulk_email_campaigns AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "Users can update own company campaigns" ON public.bulk_email_campaigns AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "Users can view own company campaigns" ON public.bulk_email_campaigns AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "Users can create recipients for own company" ON public.bulk_email_recipients AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "Users can update own company recipients" ON public.bulk_email_recipients AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "Users can view own company recipients" ON public.bulk_email_recipients AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id IN ( SELECT profiles.company_id
   FROM profiles
  WHERE (profiles.user_id = auth.uid()))));
CREATE POLICY "Employees can create calendar events" ON public.calendar_events AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (created_by = auth.uid())));
CREATE POLICY "Employees can view company calendar" ON public.calendar_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND ((is_private = false) OR (created_by = auth.uid()))));
CREATE POLICY "Users can delete own events" ON public.calendar_events AS PERMISSIVE FOR DELETE TO authenticated
  USING ((created_by = auth.uid()));
CREATE POLICY "Users can update own events" ON public.calendar_events AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((created_by = auth.uid()));
CREATE POLICY "Admins can update company cold caller usage" ON public.cold_caller_usage AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Company members can view cold caller usage" ON public.cold_caller_usage AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "System admins can view all cold caller usage" ON public.cold_caller_usage AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Users can insert own cold caller usage" ON public.cold_caller_usage AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid()))));
CREATE POLICY "Admins can update their company" ON public.companies AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Admins can view full company data" ON public.companies AS PERMISSIVE FOR SELECT TO authenticated
  USING (((id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Authenticated users can create companies" ON public.companies AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "Employees can view own company limited" ON public.companies AS PERMISSIVE FOR SELECT TO authenticated
  USING ((id = get_user_company_id(auth.uid())));
CREATE POLICY "System admins can update all companies" ON public.companies AS PERMISSIVE FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "System admins can view all companies" ON public.companies AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Anyone can insert consent logs" ON public.consent_logs AS PERMISSIVE FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY "Users can read own consent logs" ON public.consent_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Anyone can submit contact form" ON public.contact_submissions AS PERMISSIVE FOR INSERT TO anon, authenticated
  WITH CHECK (((length(TRIM(BOTH FROM name)) > 0) AND (length(TRIM(BOTH FROM email)) > 0) AND (email ~ '^[^@]+@[^@]+\.[^@]+$'::text) AND (length(TRIM(BOTH FROM message)) > 0) AND (length(name) <= 100) AND (length(email) <= 255) AND (length(message) <= 1000)));
CREATE POLICY "System admins can delete submissions" ON public.contact_submissions AS PERMISSIVE FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "System admins can read submissions" ON public.contact_submissions AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "System admins can update submissions" ON public.contact_submissions AS PERMISSIVE FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Admins can delete customers" ON public.customers AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Users can create customers in their company" ON public.customers AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (created_by = auth.uid())));
CREATE POLICY "Users can update customers in their company" ON public.customers AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view customers in their company" ON public.customers AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Admins can delete cvr lookups" ON public.cvr_companies AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Users can insert cvr lookups for their company" ON public.cvr_companies AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (created_by = auth.uid())));
CREATE POLICY "Users can update own company cvr lookups" ON public.cvr_companies AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view own company cvr lookups" ON public.cvr_companies AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Admins manage deletion requests" ON public.data_deletion_requests AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Users can create deletion requests" ON public.data_deletion_requests AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can read own deletion requests" ON public.data_deletion_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Admins can delete deals" ON public.deals AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Users can create deals in their company" ON public.deals AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (created_by = auth.uid())));
CREATE POLICY "Users can update deals in their company" ON public.deals AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view deals in their company" ON public.deals AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "System admins can view all email accounts" ON public.email_accounts AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Users can delete own email accounts" ON public.email_accounts AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can insert own email accounts" ON public.email_accounts AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid()))));
CREATE POLICY "Users can update own email accounts" ON public.email_accounts AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can view own email accounts" ON public.email_accounts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Service role can insert send log" ON public.email_send_log AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can read send log" ON public.email_send_log AS PERMISSIVE FOR SELECT TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can update send log" ON public.email_send_log AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can manage send state" ON public.email_send_state AS PERMISSIVE FOR ALL TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Users can create templates" ON public.email_templates AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (created_by = auth.uid())));
CREATE POLICY "Users can delete own templates" ON public.email_templates AS PERMISSIVE FOR DELETE TO public
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can update templates in their company" ON public.email_templates AS PERMISSIVE FOR UPDATE TO public
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view templates in their company" ON public.email_templates AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Service role can insert tokens" ON public.email_unsubscribe_tokens AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can mark tokens as used" ON public.email_unsubscribe_tokens AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can read tokens" ON public.email_unsubscribe_tokens AS PERMISSIVE FOR SELECT TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY "System admins can view all emails" ON public.emails AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Users can delete own emails" ON public.emails AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can insert own emails" ON public.emails AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can update own emails" ON public.emails AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can view own emails" ON public.emails AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Admins can create employees in their company" ON public.employee_profiles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Admins can update employees in their company" ON public.employee_profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Employees can update their own profile" ON public.employee_profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Employees can view colleagues in same company" ON public.employee_profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "System admins can view all employee profiles" ON public.employee_profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Users can create own employee profile" ON public.employee_profiles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid())) AND (created_by = auth.uid())));
CREATE POLICY "Admins manage subs" ON public.event_subscriptions AS PERMISSIVE FOR ALL TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())))
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Members view subs" ON public.event_subscriptions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can create ICPs for own company" ON public.icp_profiles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can delete own company ICPs" ON public.icp_profiles AS PERMISSIVE FOR DELETE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can update own company ICPs" ON public.icp_profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view own company ICPs" ON public.icp_profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can create jobs for own company" ON public.icp_search_jobs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can delete own company jobs" ON public.icp_search_jobs AS PERMISSIVE FOR DELETE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can update own company jobs" ON public.icp_search_jobs AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view own company jobs" ON public.icp_search_jobs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Admins can delete integrations" ON public.integrations AS PERMISSIVE FOR DELETE TO public
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Members can insert company integrations" ON public.integrations AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Members can update company integrations" ON public.integrations AS PERMISSIVE FOR UPDATE TO public
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Members can view company integrations" ON public.integrations AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Company admins can manage own company invitations" ON public.invitations AS PERMISSIVE FOR ALL TO authenticated
  USING ((((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())) OR has_role(auth.uid(), 'system_admin'::app_role)))
  WITH CHECK ((((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())) OR has_role(auth.uid(), 'system_admin'::app_role)));
CREATE POLICY "Users can read invitation by matching token" ON public.invitations AS PERMISSIVE FOR SELECT TO authenticated
  USING (((lower(email) = lower((( SELECT users.email
   FROM auth.users
  WHERE (users.id = auth.uid())))::text)) OR ((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid()))));
CREATE POLICY "Admins can delete invoices" ON public.invoices AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Users can create invoices in their company" ON public.invoices AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (created_by = auth.uid())));
CREATE POLICY "Users can update invoices in their company" ON public.invoices AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view invoices in their company" ON public.invoices AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Admins can delete folders" ON public.lead_folders AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Users can create folders in their company" ON public.lead_folders AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (created_by = auth.uid())));
CREATE POLICY "Users can update folders in their company" ON public.lead_folders AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view folders in their company" ON public.lead_folders AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "System admins can view all results" ON public.lead_gen_results AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Users can insert results for own company" ON public.lead_gen_results AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can update own company results" ON public.lead_gen_results AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view own company results" ON public.lead_gen_results AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "System admins can view all saved searches" ON public.lead_gen_saved_searches AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Users can create saved searches" ON public.lead_gen_saved_searches AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (user_id = auth.uid())));
CREATE POLICY "Users can delete own saved searches" ON public.lead_gen_saved_searches AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can view own company saved searches" ON public.lead_gen_saved_searches AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "System admins can view all sessions" ON public.lead_gen_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Users can create sessions in their company" ON public.lead_gen_sessions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (user_id = auth.uid())));
CREATE POLICY "Users can delete own sessions" ON public.lead_gen_sessions AS PERMISSIVE FOR DELETE TO authenticated
  USING (((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid()))));
CREATE POLICY "Users can update own company sessions" ON public.lead_gen_sessions AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view own company sessions" ON public.lead_gen_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can delete own company scores" ON public.lead_icp_scores AS PERMISSIVE FOR DELETE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can insert own company scores" ON public.lead_icp_scores AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can update own company scores" ON public.lead_icp_scores AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view own company scores" ON public.lead_icp_scores AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can create leads in their company" ON public.leads AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (created_by = auth.uid())));
CREATE POLICY "Users can delete leads in their company" ON public.leads AS PERMISSIVE FOR DELETE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can update leads in their company" ON public.leads AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view leads in their company" ON public.leads AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Admins can update all leave requests" ON public.leave_requests AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Employees can create their own leave requests" ON public.leave_requests AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (employee_profile_id IN ( SELECT employee_profiles.id
   FROM employee_profiles
  WHERE (employee_profiles.user_id = auth.uid())))));
CREATE POLICY "Employees can update their own pending leave requests" ON public.leave_requests AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((employee_profile_id IN ( SELECT employee_profiles.id
   FROM employee_profiles
  WHERE (employee_profiles.user_id = auth.uid()))) AND (status = 'pending'::leave_status)));
CREATE POLICY "Employees can view leave requests in their company" ON public.leave_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users create own mcp tokens" ON public.mcp_tokens AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid()))));
CREATE POLICY "Users delete own mcp tokens" ON public.mcp_tokens AS PERMISSIVE FOR DELETE TO authenticated
  USING (((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid()))));
CREATE POLICY "Users revoke own mcp tokens" ON public.mcp_tokens AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid()))));
CREATE POLICY "Users view own mcp tokens" ON public.mcp_tokens AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) AND (company_id = get_user_company_id(auth.uid()))));
CREATE POLICY "Users can mark their received messages as read" ON public.messages AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((receiver_id = auth.uid()));
CREATE POLICY "Users can send messages in their company" ON public.messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (sender_id = auth.uid())));
CREATE POLICY "Users can view their own messages" ON public.messages AS PERMISSIVE FOR SELECT TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND ((sender_id = auth.uid()) OR (receiver_id = auth.uid()))));
CREATE POLICY "Users can delete their company meta ad accounts" ON public.meta_ad_accounts AS PERMISSIVE FOR DELETE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can insert meta ad accounts for their company" ON public.meta_ad_accounts AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view their company meta ad accounts" ON public.meta_ad_accounts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Admins can delete their company meta connection" ON public.meta_connections AS PERMISSIVE FOR DELETE TO public
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Admins can view their company meta connection" ON public.meta_connections AS PERMISSIVE FOR SELECT TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Users can delete their company meta connection" ON public.meta_connections AS PERMISSIVE FOR DELETE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can insert meta connection for their company" ON public.meta_connections AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can update their company meta connection" ON public.meta_connections AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "System can create notifications" ON public.notifications AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can mark their notifications as read" ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can view their own notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Company admins manage openai account" ON public.openai_accounts AS PERMISSIVE FOR ALL TO public
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())))
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Company members view own openai account" ON public.openai_accounts AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can create payments in their company" ON public.payments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (created_by = auth.uid())));
CREATE POLICY "Users can update payments in their company" ON public.payments AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view payments in their company" ON public.payments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Admins can create payroll" ON public.payroll AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Admins can update payroll" ON public.payroll AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Admins can view all payroll in their company" ON public.payroll AS PERMISSIVE FOR SELECT TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Employees can view their own payroll" ON public.payroll AS PERMISSIVE FOR SELECT TO authenticated
  USING ((employee_profile_id IN ( SELECT employee_profiles.id
   FROM employee_profiles
  WHERE (employee_profiles.user_id = auth.uid()))));
CREATE POLICY "Admins can delete phone provisions" ON public.phone_provisions AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Users can create phone provisions" ON public.phone_provisions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view company phone provisions" ON public.phone_provisions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Admins can manage pipeline stages" ON public.pipeline_stages AS PERMISSIVE FOR ALL TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())))
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Users can view pipeline stages in their company" ON public.pipeline_stages AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Admins can view company profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_company_admin(auth.uid()) AND (company_id = get_user_company_id(auth.uid()))));
CREATE POLICY "Company members can view colleagues" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "System admins can view all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Users can insert own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can insert their own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can read own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can update their own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can view own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can view their own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Admins can delete quotes" ON public.quotes AS PERMISSIVE FOR DELETE TO public
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Users can create quotes in their company" ON public.quotes AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (created_by = auth.uid())));
CREATE POLICY "Users can update quotes in their company" ON public.quotes AS PERMISSIVE FOR UPDATE TO public
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view quotes in their company" ON public.quotes AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Admins can create recruitment" ON public.recruitment AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Admins can delete recruitment" ON public.recruitment AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Admins can update recruitment" ON public.recruitment AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Users can view recruitment in their company" ON public.recruitment AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can create saved filters" ON public.saved_lead_filters AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (user_id = auth.uid())));
CREATE POLICY "Users can delete own saved filters" ON public.saved_lead_filters AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can view own company saved filters" ON public.saved_lead_filters AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Company admins can view own subscription" ON public.subscriptions AS PERMISSIVE FOR SELECT TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "System admins can manage subscriptions" ON public.subscriptions AS PERMISSIVE FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "System admins can view all subscriptions" ON public.subscriptions AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Service role can insert suppressed emails" ON public.suppressed_emails AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.role() = 'service_role'::text));
CREATE POLICY "Service role can read suppressed emails" ON public.suppressed_emails AS PERMISSIVE FOR SELECT TO public
  USING ((auth.role() = 'service_role'::text));
CREATE POLICY "Admins can delete tasks" ON public.tasks AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Users can create tasks in their company" ON public.tasks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (created_by = auth.uid())));
CREATE POLICY "Users can update tasks assigned to them or created by them" ON public.tasks AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND ((assigned_to = auth.uid()) OR (created_by = auth.uid()) OR is_company_admin(auth.uid()))));
CREATE POLICY "Users can view tasks in their company" ON public.tasks AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Admins can manage teams" ON public.teams AS PERMISSIVE FOR ALL TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())))
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Company admins can manage teams" ON public.teams AS PERMISSIVE FOR ALL TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())))
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Users can view company teams" ON public.teams AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view teams in their company" ON public.teams AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Company admins can manage twilio accounts" ON public.twilio_accounts AS PERMISSIVE FOR ALL TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())))
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Company members can view twilio connection status" ON public.twilio_accounts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view own company quotas" ON public.usage_quotas AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Company admins can manage non-system roles in their company" ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated
  USING ((is_company_admin(auth.uid()) AND (role <> 'system_admin'::app_role) AND (get_user_company_id(user_id) = get_user_company_id(auth.uid()))))
  WITH CHECK ((is_company_admin(auth.uid()) AND (role <> 'system_admin'::app_role) AND (get_user_company_id(user_id) = get_user_company_id(auth.uid()))));
CREATE POLICY "System admins can view all roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Users can view their own roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((auth.uid() = user_id));
CREATE POLICY "Company admins can view company sessions" ON public.user_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "System admins can view all sessions" ON public.user_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'system_admin'::app_role));
CREATE POLICY "Users can insert own sessions" ON public.user_sessions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can update own sessions" ON public.user_sessions AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Users can view own sessions" ON public.user_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));
CREATE POLICY "Company admins manage voice agents" ON public.voice_agents AS PERMISSIVE FOR ALL TO public
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())))
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Company members view voice agents" ON public.voice_agents AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Company members view voice call events" ON public.voice_call_events AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "System inserts voice call events" ON public.voice_call_events AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Company admins delete voice calls" ON public.voice_calls AS PERMISSIVE FOR DELETE TO public
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Company members create voice calls" ON public.voice_calls AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Company members update voice calls" ON public.voice_calls AS PERMISSIVE FOR UPDATE TO public
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Company members view voice calls" ON public.voice_calls AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can insert webhook logs" ON public.webhook_logs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view company webhook logs" ON public.webhook_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Admins can delete company webhooks" ON public.webhooks AS PERMISSIVE FOR DELETE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Admins can insert company webhooks" ON public.webhooks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Admins can update company webhooks" ON public.webhooks AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Users can view company webhooks" ON public.webhooks AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Admins can manage schedules" ON public.work_schedules AS PERMISSIVE FOR ALL TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())))
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Managers can create schedules" ON public.work_schedules AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND (created_by = auth.uid())));
CREATE POLICY "Managers can update schedules" ON public.work_schedules AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND (created_by = auth.uid())));
CREATE POLICY "Users can view company schedules" ON public.work_schedules AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can create workflows for own company" ON public.workflows AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can delete own company workflows" ON public.workflows AS PERMISSIVE FOR DELETE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can update own company workflows" ON public.workflows AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Users can view own company workflows" ON public.workflows AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Admins can manage workforce settings" ON public.workforce_settings AS PERMISSIVE FOR ALL TO authenticated
  USING (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())))
  WITH CHECK (((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())));
CREATE POLICY "Users can view own company workforce settings" ON public.workforce_settings AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Members emit events" ON public.workspace_events AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_user_company_id(auth.uid())));
CREATE POLICY "Members view events" ON public.workspace_events AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())));