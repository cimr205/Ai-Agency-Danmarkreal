-- Epic 1 hardening: deterministic conversion, durable customer linkage,
-- pipeline-stage support, and an indexed server-side lead query.

alter table public.customers
  add column if not exists converted_customer_id uuid references public.customers(id) on delete set null;

alter table public.deals
  add column if not exists currency text not null default 'DKK';

create index if not exists customers_converted_customer_idx
  on public.customers (converted_customer_id)
  where converted_customer_id is not null;

create index if not exists customers_lead_search_idx
  on public.customers (company_id, record_type, created_at desc);

-- Preserve the customer link for conversions performed by the previous RPC.
update public.customers lead
set converted_customer_id = deal.customer_id
from public.deals deal
where lead.converted_customer_id is null
  and lead.converted_deal_id = deal.id
  and deal.customer_id is not null
  and lead.company_id = deal.company_id;

create or replace function public.convert_lead_to_deal(
  p_lead_id uuid,
  p_deal_name text,
  p_pipeline_stage_id uuid default null,
  p_value numeric default null,
  p_currency text default 'DKK'
)
returns table (
  lead_id uuid,
  customer_id uuid,
  deal_id uuid,
  dedupe_result text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_user_id uuid := auth.uid();
  v_lead public.customers%rowtype;
  v_customer_id uuid;
  v_deal_id uuid;
  v_dedupe text := 'created';
  v_norm_email text;
  v_norm_phone text;
  v_identity_key text;
  v_stage text := 'discovery';
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  v_company_id := public.get_user_company_id(v_user_id);
  if v_company_id is null then
    raise exception 'No company associated with caller' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_deal_name, '')), '') is null then
    raise exception 'Deal name is required' using errcode = '22023';
  end if;

  if coalesce(p_value, 0) < 0 then
    raise exception 'Deal value cannot be negative' using errcode = '22023';
  end if;

  select * into v_lead
  from public.customers
  where id = p_lead_id
    and company_id = v_company_id
    and record_type = 'lead'
  for update;

  if not found then
    raise exception 'Lead not found for this company' using errcode = 'P0002';
  end if;

  if v_lead.conversion_status = 'converted' then
    v_customer_id := v_lead.converted_customer_id;
    v_deal_id := v_lead.converted_deal_id;

    if v_customer_id is null and v_deal_id is not null then
      select d.customer_id into v_customer_id
      from public.deals d
      where d.id = v_deal_id and d.company_id = v_company_id;
    end if;

    if v_customer_id is null or v_deal_id is null then
      raise exception 'Converted lead has an incomplete conversion link' using errcode = 'P0001';
    end if;

    return query select v_lead.id, v_customer_id, v_deal_id, 'already_converted'::text;
    return;
  end if;

  v_norm_email := nullif(lower(trim(coalesce(v_lead.email, ''))), '');
  v_norm_phone := public.normalize_phone_number(v_lead.phone);
  v_identity_key := v_company_id::text || ':' || coalesce(
    case when v_norm_email is not null then 'email:' || v_norm_email end,
    case when v_norm_phone is not null then 'phone:' || v_norm_phone end,
    'lead:' || v_lead.id::text
  );

  -- Locks the canonical identity, not only the lead. Two different leads with
  -- the same email/phone can therefore never race through find-or-create.
  perform pg_advisory_xact_lock(hashtextextended(v_identity_key, 0));

  if v_norm_email is not null then
    select c.id into v_customer_id
    from public.customers c
    where c.company_id = v_company_id
      and c.record_type = 'customer'
      and c.normalized_email = v_norm_email
    order by c.created_at, c.id
    limit 1
    for update;
  end if;

  if v_customer_id is null and v_norm_phone is not null then
    select c.id into v_customer_id
    from public.customers c
    where c.company_id = v_company_id
      and c.record_type = 'customer'
      and c.normalized_phone = v_norm_phone
    order by c.created_at, c.id
    limit 1
    for update;
  end if;

  if v_customer_id is not null then
    v_dedupe := 'matched_existing';
  else
    insert into public.customers (
      company_id, created_by, name, email, phone, address, city,
      company_name, industry, record_type, converted_from_lead_id,
      currency, source_id, campaign_id
    ) values (
      v_company_id, v_user_id,
      coalesce(nullif(v_lead.name, ''), nullif(v_lead.company_name, ''), 'Customer'),
      v_lead.email, v_lead.phone, v_lead.address, v_lead.city,
      v_lead.company_name, v_lead.industry, 'customer', v_lead.id,
      coalesce(nullif(p_currency, ''), v_lead.currency, 'DKK'),
      v_lead.source_id, v_lead.campaign_id
    )
    returning id into v_customer_id;
  end if;

  if p_pipeline_stage_id is not null then
    select ps.name into v_stage
    from public.pipeline_stages ps
    where ps.id = p_pipeline_stage_id and ps.company_id = v_company_id;

    if v_stage is null then
      raise exception 'Pipeline stage not found for this company' using errcode = 'P0002';
    end if;
  end if;

  insert into public.deals (
    company_id, created_by, customer_id, title, value, currency, stage, notes
  ) values (
    v_company_id, v_user_id, v_customer_id, trim(p_deal_name),
    coalesce(p_value, v_lead.value, 0),
    coalesce(nullif(upper(trim(p_currency)), ''), v_lead.currency, 'DKK'),
    v_stage,
    'Converted from lead: ' || v_lead.name || E'\nEmail: ' ||
      coalesce(v_lead.email, 'N/A') || E'\nPhone: ' || coalesce(v_lead.phone, 'N/A')
  )
  returning id into v_deal_id;

  update public.customers
  set status = 'customer',
      conversion_status = 'converted',
      converted_customer_id = v_customer_id,
      converted_deal_id = v_deal_id,
      converted_at = now()
  where id = v_lead.id;

  insert into public.activity_logs (
    user_id, company_id, action_type, entity_type, entity_id, description, metadata
  ) values (
    v_user_id, v_company_id, 'lead_converted', 'lead', v_lead.id,
    'Lead "' || v_lead.name || '" converted to deal',
    jsonb_build_object(
      'customer_id', v_customer_id,
      'deal_id', v_deal_id,
      'dedupe_result', v_dedupe,
      'pipeline_stage_id', p_pipeline_stage_id
    )
  );

  return query select v_lead.id, v_customer_id, v_deal_id, v_dedupe;
end;
$$;

revoke all on function public.convert_lead_to_deal(uuid, text, uuid, numeric, text) from public;
grant execute on function public.convert_lead_to_deal(uuid, text, uuid, numeric, text) to authenticated;

create or replace function public.list_leads(
  p_page integer default 0,
  p_page_size integer default 100,
  p_search text default null,
  p_sort_field text default 'created_at',
  p_sort_direction text default 'desc',
  p_status text default null,
  p_owner_id uuid default null,
  p_source_id uuid default null,
  p_campaign_id uuid default null,
  p_folder_id uuid default null,
  p_tags text[] default null,
  p_tag_logic text default 'or',
  p_industry text default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_company_id uuid := public.get_user_company_id(auth.uid());
  v_page integer := greatest(coalesce(p_page, 0), 0);
  v_page_size integer := least(greatest(coalesce(p_page_size, 100), 1), 250);
  v_sort_field text;
  v_sort_direction text;
  v_total bigint;
  v_items jsonb;
begin
  if auth.uid() is null or v_company_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  v_sort_field := case p_sort_field
    when 'name' then 'name'
    when 'value' then 'value'
    when 'score' then 'score'
    when 'last_touched_at' then 'last_touched_at'
    when 'updated_at' then 'updated_at'
    else 'created_at'
  end;
  v_sort_direction := case lower(coalesce(p_sort_direction, 'desc'))
    when 'asc' then 'asc'
    else 'desc'
  end;

  select count(*) into v_total
  from public.customers c
  where c.company_id = v_company_id
    and c.record_type = 'lead'
    and (p_status is null or c.status::text = p_status)
    and (p_owner_id is null or c.owner_id = p_owner_id)
    and (p_source_id is null or c.source_id = p_source_id)
    and (p_campaign_id is null or c.campaign_id = p_campaign_id)
    and (p_folder_id is null or c.folder_id = p_folder_id)
    and (p_industry is null or c.industry = p_industry)
    and (
      nullif(trim(coalesce(p_search, '')), '') is null
      or c.name ilike '%' || trim(p_search) || '%'
      or c.email ilike '%' || trim(p_search) || '%'
      or coalesce(c.company_name, '') ilike '%' || trim(p_search) || '%'
      or coalesce(c.phone, '') ilike '%' || trim(p_search) || '%'
    )
    and (
      coalesce(cardinality(p_tags), 0) = 0
      or (lower(coalesce(p_tag_logic, 'or')) = 'and' and c.tags @> p_tags)
      or (lower(coalesce(p_tag_logic, 'or')) <> 'and' and c.tags && p_tags)
    );

  execute format(
    $query$
      select coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
      from (
        select c.*,
          case when p.user_id is null then null
               else jsonb_build_object('full_name', p.full_name, 'email', p.email)
          end as owner
        from public.customers c
        left join public.profiles p on p.user_id = c.owner_id
        where c.company_id = $1
          and c.record_type = 'lead'
          and ($2 is null or c.status::text = $2)
          and ($3 is null or c.owner_id = $3)
          and ($4 is null or c.source_id = $4)
          and ($5 is null or c.campaign_id = $5)
          and ($6 is null or c.folder_id = $6)
          and ($12 is null or c.industry = $12)
          and (
            nullif(trim(coalesce($7, '')), '') is null
            or c.name ilike '%%' || trim($7) || '%%'
            or c.email ilike '%%' || trim($7) || '%%'
            or coalesce(c.company_name, '') ilike '%%' || trim($7) || '%%'
            or coalesce(c.phone, '') ilike '%%' || trim($7) || '%%'
          )
          and (
            coalesce(cardinality($8), 0) = 0
            or (lower(coalesce($9, 'or')) = 'and' and c.tags @> $8)
            or (lower(coalesce($9, 'or')) <> 'and' and c.tags && $8)
          )
        order by c.%I %s nulls last, c.id
        limit $10 offset $11
      ) row_data
    $query$,
    v_sort_field,
    v_sort_direction
  ) into v_items using
    v_company_id, p_status, p_owner_id, p_source_id, p_campaign_id,
    p_folder_id, p_search, p_tags, p_tag_logic,
    v_page_size, v_page * v_page_size, p_industry;

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'total_count', v_total,
    'page', v_page,
    'page_size', v_page_size,
    'total_pages', case when v_total = 0 then 0 else ceil(v_total::numeric / v_page_size)::integer end
  );
end;
$$;

revoke all on function public.list_leads(integer, integer, text, text, text, text, uuid, uuid, uuid, uuid, text[], text, text) from public;
grant execute on function public.list_leads(integer, integer, text, text, text, text, uuid, uuid, uuid, uuid, text[], text, text) to authenticated;
