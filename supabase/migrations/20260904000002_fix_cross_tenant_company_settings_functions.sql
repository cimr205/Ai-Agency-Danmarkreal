-- E2E-006 (P0, docs/full-system-e2e-audit.md): set_company_mode() and
-- update_compliance_item() both checked only is_company_admin(auth.uid())
-- — that confirms the caller is an admin of THEIR OWN company, not that
-- the caller-supplied _company_id belongs to them. Any authenticated
-- company_admin, of any company, could call either with an arbitrary
-- victim _company_id and overwrite that company's mode or compliance
-- checklist. Adding the missing ownership check, matching the correct
-- pattern already used by regenerate_activation_code().
create or replace function public.set_company_mode(_company_id uuid, _mode text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
    IF NOT (is_company_admin(auth.uid()) AND get_user_company_id(auth.uid()) = _company_id) THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;

    UPDATE public.companies SET mode = _mode WHERE id = _company_id;
    RETURN TRUE;
END;
$function$;

create or replace function public.update_compliance_item(_company_id uuid, _item text, _value boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
