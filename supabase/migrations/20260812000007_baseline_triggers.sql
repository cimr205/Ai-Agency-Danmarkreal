-- Baseline: triggers
-- Consolidated from schema-recon reconstruction, verified applied against vbxlpxhvojlaisxcipyh

-- Triggers reconstructed from source DB (public schema)
CREATE TRIGGER on_ai_generation_change AFTER INSERT ON public.ai_generations FOR EACH ROW EXECUTE FUNCTION trigger_log_ai_generation();
CREATE TRIGGER on_ai_generation_change_upd AFTER UPDATE ON public.ai_generations FOR EACH ROW EXECUTE FUNCTION trigger_log_ai_generation();
CREATE TRIGGER trg_log_ai_generation AFTER INSERT ON public.ai_generations FOR EACH ROW EXECUTE FUNCTION trigger_log_ai_generation();
CREATE TRIGGER trg_log_ai_generation_upd AFTER UPDATE ON public.ai_generations FOR EACH ROW EXECUTE FUNCTION trigger_log_ai_generation();

CREATE TRIGGER trg_auto_updated_at BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION auto_updated_at();
CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER on_company_created AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION trigger_log_company_created();
CREATE TRIGGER trg_log_company_created AFTER INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION trigger_log_company_created();
CREATE TRIGGER trg_set_company_activation_code BEFORE INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION set_company_activation_code();
CREATE TRIGGER trg_updated_at_companies BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_set_activation_code BEFORE INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION set_company_activation_code();
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER contact_rate_limit BEFORE INSERT ON public.contact_submissions FOR EACH ROW EXECUTE FUNCTION check_contact_rate_limit();

CREATE TRIGGER trg_auto_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION auto_updated_at();
CREATE TRIGGER trg_updated_at_customers BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_cvr_companies_updated_at BEFORE UPDATE ON public.cvr_companies FOR EACH ROW EXECUTE FUNCTION auto_updated_at();

CREATE TRIGGER on_deal_change AFTER INSERT ON public.deals FOR EACH ROW EXECUTE FUNCTION trigger_log_deal_change();
CREATE TRIGGER on_deal_change_upd AFTER UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION trigger_log_deal_change();
CREATE TRIGGER tr_deal_event AFTER INSERT ON public.deals FOR EACH ROW EXECUTE FUNCTION trg_emit_deal_event();
CREATE TRIGGER tr_deal_event_upd AFTER UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION trg_emit_deal_event();
CREATE TRIGGER trg_auto_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION auto_updated_at();
CREATE TRIGGER trg_log_deal_change AFTER UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION trigger_log_deal_change();
CREATE TRIGGER trg_log_deal_change_ins AFTER INSERT ON public.deals FOR EACH ROW EXECUTE FUNCTION trigger_log_deal_change();
CREATE TRIGGER trg_updated_at_deals BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_deals_updated_at BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_auto_updated_at BEFORE UPDATE ON public.email_accounts FOR EACH ROW EXECUTE FUNCTION auto_updated_at();

CREATE TRIGGER on_employee_created AFTER INSERT ON public.employee_profiles FOR EACH ROW EXECUTE FUNCTION trigger_log_employee_created();
CREATE TRIGGER trg_auto_updated_at BEFORE UPDATE ON public.employee_profiles FOR EACH ROW EXECUTE FUNCTION auto_updated_at();
CREATE TRIGGER trg_log_employee_created AFTER INSERT ON public.employee_profiles FOR EACH ROW EXECUTE FUNCTION trigger_log_employee_created();
CREATE TRIGGER trg_updated_at_employee_profiles BEFORE UPDATE ON public.employee_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_employee_profiles_updated_at BEFORE UPDATE ON public.employee_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_icp_profiles_updated_at BEFORE UPDATE ON public.icp_profiles FOR EACH ROW EXECUTE FUNCTION auto_updated_at();
CREATE TRIGGER update_icp_search_jobs_updated_at BEFORE UPDATE ON public.icp_search_jobs FOR EACH ROW EXECUTE FUNCTION auto_updated_at();

CREATE TRIGGER trg_integrations_updated_at BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER on_invoice_created AFTER INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION trigger_log_invoice_created();
CREATE TRIGGER tr_invoice_event_upd AFTER UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION trg_emit_invoice_event();
CREATE TRIGGER tr_invoice_event_ins AFTER INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION trg_emit_invoice_event();
CREATE TRIGGER trg_auto_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION auto_updated_at();
CREATE TRIGGER trg_log_invoice_created AFTER INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION trigger_log_invoice_created();
CREATE TRIGGER trg_updated_at_invoices BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trigger_auto_payment_on_invoice_paid AFTER UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION auto_create_payment_on_invoice_paid();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_auto_updated_at BEFORE UPDATE ON public.lead_gen_sessions FOR EACH ROW EXECUTE FUNCTION auto_updated_at();

CREATE TRIGGER on_lead_change_upd AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION trigger_log_lead_change();
CREATE TRIGGER on_lead_change_ins AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION trigger_log_lead_change();
CREATE TRIGGER tr_lead_event_ins AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION trg_emit_lead_event();
CREATE TRIGGER tr_lead_event_upd AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION trg_emit_lead_event();
CREATE TRIGGER trg_log_lead_change_upd AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION trigger_log_lead_change();
CREATE TRIGGER trg_log_lead_change_ins AFTER INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION trigger_log_lead_change();
CREATE TRIGGER trg_update_lead_touched BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION update_lead_touched();
CREATE TRIGGER trg_updated_at_leads BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leads_touched BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION update_lead_touched();
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_auto_updated_at BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION auto_updated_at();
CREATE TRIGGER trg_updated_at_leave_requests BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leave_requests_updated_at BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER on_meta_connection_change_ins AFTER INSERT ON public.meta_connections FOR EACH ROW EXECUTE FUNCTION trigger_log_meta_connection();
CREATE TRIGGER on_meta_connection_change_upd AFTER UPDATE ON public.meta_connections FOR EACH ROW EXECUTE FUNCTION trigger_log_meta_connection();
CREATE TRIGGER trg_log_meta_connection_ins AFTER INSERT ON public.meta_connections FOR EACH ROW EXECUTE FUNCTION trigger_log_meta_connection();
CREATE TRIGGER trg_log_meta_connection_upd AFTER UPDATE ON public.meta_connections FOR EACH ROW EXECUTE FUNCTION trigger_log_meta_connection();
CREATE TRIGGER trg_updated_at_meta_connections BEFORE UPDATE ON public.meta_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_openai_accounts_updated BEFORE UPDATE ON public.openai_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_auto_mark_invoice_paid_ins AFTER INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION auto_mark_invoice_paid();
CREATE TRIGGER trg_auto_mark_invoice_paid_upd AFTER UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION auto_mark_invoice_paid();
CREATE TRIGGER trg_auto_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION auto_updated_at();

CREATE TRIGGER trg_updated_at_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_auto_updated_at BEFORE UPDATE ON public.recruitment FOR EACH ROW EXECUTE FUNCTION auto_updated_at();
CREATE TRIGGER trg_updated_at_recruitment BEFORE UPDATE ON public.recruitment FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_recruitment_updated_at BEFORE UPDATE ON public.recruitment FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER on_task_change_ins AFTER INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION trigger_log_task_change();
CREATE TRIGGER on_task_change_upd AFTER UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION trigger_log_task_change();
CREATE TRIGGER tr_task_event_upd AFTER UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION trg_emit_task_event();
CREATE TRIGGER tr_task_event_ins AFTER INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION trg_emit_task_event();
CREATE TRIGGER trg_log_task_change_ins AFTER INSERT ON public.tasks FOR EACH ROW EXECUTE FUNCTION trigger_log_task_change();
CREATE TRIGGER trg_log_task_change_upd AFTER UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION trigger_log_task_change();
CREATE TRIGGER trg_updated_at_tasks BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_twilio_accounts_updated_at BEFORE UPDATE ON public.twilio_accounts FOR EACH ROW EXECUTE FUNCTION auto_updated_at();

CREATE TRIGGER update_usage_quotas_updated_at BEFORE UPDATE ON public.usage_quotas FOR EACH ROW EXECUTE FUNCTION auto_updated_at();

CREATE TRIGGER enforce_owner_limit BEFORE INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION check_owner_limit();
CREATE TRIGGER trg_check_owner_limit BEFORE INSERT ON public.user_roles FOR EACH ROW EXECUTE FUNCTION check_owner_limit();

CREATE TRIGGER trg_voice_agents_updated BEFORE UPDATE ON public.voice_agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_voice_calls_updated BEFORE UPDATE ON public.voice_calls FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON public.webhooks FOR EACH ROW EXECUTE FUNCTION auto_updated_at();

CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON public.workflows FOR EACH ROW EXECUTE FUNCTION auto_updated_at();
