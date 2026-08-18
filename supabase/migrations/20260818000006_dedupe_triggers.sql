-- The schema-recon reconstruction captured a live database that had
-- accumulated two generations of trigger naming (on_*/trg_auto_updated_at
-- vs trg_log_*/update_*_updated_at) without the old ones ever being
-- dropped. Result: many tables fire the SAME logging/timestamp function
-- 2-3 times per row change. Verified live via information_schema.triggers -
-- e.g. every deal/lead/task insert or update writes its activity_logs
-- entry TWICE (on_deal_change + trg_log_deal_change_ins both call
-- trigger_log_deal_change() on INSERT), and updated_at is set redundantly
-- by 2-3 near-identical triggers on several tables. This directly explains
-- duplicated entries in the activity feed for deals, leads, tasks,
-- invoices, employees, AI generations, meta connections, and company
-- creation.
--
-- Keeping exactly one trigger per (table, event, effect); dropping the
-- rest.

DROP TRIGGER IF EXISTS on_ai_generation_change ON public.ai_generations;
DROP TRIGGER IF EXISTS on_ai_generation_change_upd ON public.ai_generations;

DROP TRIGGER IF EXISTS trg_auto_updated_at ON public.calendar_events;

DROP TRIGGER IF EXISTS on_company_created ON public.companies;
DROP TRIGGER IF EXISTS trigger_set_activation_code ON public.companies;
DROP TRIGGER IF EXISTS trg_updated_at_companies ON public.companies;

DROP TRIGGER IF EXISTS trg_auto_updated_at ON public.customers;
DROP TRIGGER IF EXISTS trg_updated_at_customers ON public.customers;

DROP TRIGGER IF EXISTS on_deal_change ON public.deals;
DROP TRIGGER IF EXISTS on_deal_change_upd ON public.deals;
DROP TRIGGER IF EXISTS trg_auto_updated_at ON public.deals;
DROP TRIGGER IF EXISTS trg_updated_at_deals ON public.deals;

DROP TRIGGER IF EXISTS on_employee_created ON public.employee_profiles;
DROP TRIGGER IF EXISTS trg_auto_updated_at ON public.employee_profiles;
DROP TRIGGER IF EXISTS trg_updated_at_employee_profiles ON public.employee_profiles;

DROP TRIGGER IF EXISTS on_invoice_created ON public.invoices;
DROP TRIGGER IF EXISTS trg_auto_updated_at ON public.invoices;
DROP TRIGGER IF EXISTS trg_updated_at_invoices ON public.invoices;

DROP TRIGGER IF EXISTS on_lead_change_ins ON public.leads;
DROP TRIGGER IF EXISTS on_lead_change_upd ON public.leads;
DROP TRIGGER IF EXISTS update_leads_touched ON public.leads;
DROP TRIGGER IF EXISTS trg_updated_at_leads ON public.leads;

DROP TRIGGER IF EXISTS trg_auto_updated_at ON public.leave_requests;
DROP TRIGGER IF EXISTS trg_updated_at_leave_requests ON public.leave_requests;

DROP TRIGGER IF EXISTS on_meta_connection_change_ins ON public.meta_connections;
DROP TRIGGER IF EXISTS on_meta_connection_change_upd ON public.meta_connections;

DROP TRIGGER IF EXISTS trg_updated_at_profiles ON public.profiles;

DROP TRIGGER IF EXISTS trg_auto_updated_at ON public.recruitment;
DROP TRIGGER IF EXISTS trg_updated_at_recruitment ON public.recruitment;

DROP TRIGGER IF EXISTS on_task_change_ins ON public.tasks;
DROP TRIGGER IF EXISTS on_task_change_upd ON public.tasks;
DROP TRIGGER IF EXISTS trg_updated_at_tasks ON public.tasks;

DROP TRIGGER IF EXISTS enforce_owner_limit ON public.user_roles;
