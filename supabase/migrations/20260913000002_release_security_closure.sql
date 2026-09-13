-- Release closure: preserve tenant ownership in SECURITY DEFINER settings
-- functions and prevent concurrent invoice-number duplication.

create or replace function public.set_company_mode(_company_id uuid, _mode text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (
    public.is_company_admin(auth.uid())
    and public.get_user_company_id(auth.uid()) = _company_id
  ) then
    raise exception 'Not authorized';
  end if;

  update public.companies set mode = _mode where id = _company_id;
  return true;
end;
$function$;

create or replace function public.update_compliance_item(_company_id uuid, _item text, _value boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  new_checklist jsonb;
begin
  if not (
    public.is_company_admin(auth.uid())
    and public.get_user_company_id(auth.uid()) = _company_id
  ) then
    raise exception 'Not authorized';
  end if;

  update public.companies
  set compliance_checklist = jsonb_set(compliance_checklist, array[_item], to_jsonb(_value))
  where id = _company_id
  returning compliance_checklist into new_checklist;

  return new_checklist;
end;
$function$;

alter table public.invoices
  add constraint invoices_company_invoice_number_key unique (company_id, invoice_number);
