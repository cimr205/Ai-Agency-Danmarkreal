-- Correction to 20260922000002 and 20260922000003: column-level GRANT
-- cannot distinguish "the row owner acting on their own row" from "a
-- company_admin acting on someone else's row" when both reach Postgres
-- as the same `authenticated` role (there is no separate SQL role per
-- app-level role). Revoking UPDATE on is_active/department/position/
-- employee_id (employee_profiles) and status/approved_by/approved_at
-- (leave_requests) from `authenticated` entirely blocked ADMINS from
-- updating those columns too — a real regression, caught before
-- shipping further on top of it. This is exactly the limitation
-- 20260818000005_fix_tenant_hop_rls.sql's own comment already warned
-- about for employee_profiles specifically.
--
-- Correct fix: restore the full column grant, and instead use a
-- BEFORE UPDATE trigger that lets company_admin/system_admin through
-- unconditionally, and blocks a non-admin from changing the restricted
-- columns on their own row.

GRANT UPDATE ON public.employee_profiles TO authenticated;
GRANT UPDATE ON public.leave_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_employee_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_company_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.department IS DISTINCT FROM OLD.department
     OR NEW.position IS DISTINCT FROM OLD.position
     OR NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    RAISE EXCEPTION 'Not authorized to change this field' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_employee_self_escalation ON public.employee_profiles;
CREATE TRIGGER trg_prevent_employee_self_escalation
BEFORE UPDATE ON public.employee_profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_employee_self_escalation();

CREATE OR REPLACE FUNCTION public.prevent_leave_request_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.is_company_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'Not authorized to approve/reject this request' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_leave_request_self_approval ON public.leave_requests;
CREATE TRIGGER trg_prevent_leave_request_self_approval
BEFORE UPDATE ON public.leave_requests
FOR EACH ROW EXECUTE FUNCTION public.prevent_leave_request_self_approval();
