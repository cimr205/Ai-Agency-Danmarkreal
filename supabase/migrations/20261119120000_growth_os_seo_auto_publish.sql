-- Growth OS: SEO autopilot may publish its own articles (owner decision 2026-11-19).
--
-- Until now every draft waited for a human and nothing reached the website. The
-- owner wants the autopilot to publish by itself. This adds that, opt-in per
-- company and fenced in:
--   * only articles (kind 'page') under the site's own /da/guide/ section; the
--     agent cannot change any other page of the website;
--   * only drafts written AFTER auto-publish was switched on (never the imported
--     backlog), with a reviewer score >= publish_min_score, and only after the
--     service's deterministic content checks (no invented prices, trial lengths
--     or outside links) passed;
--   * at most max_publish_per_day per company;
--   * every publish is in growth_audit_log, and owner/admin can unpublish any
--     article with one call (growth_seo_unpublish).
-- A human approval (growth_seo_decide_draft) now publishes the article too.
-- The public site reads published articles through growth_seo_published_articles().

alter table public.growth_seo_sites
  add column if not exists auto_publish boolean not null default false,
  add column if not exists auto_publish_since timestamptz,
  add column if not exists publish_min_score smallint not null default 8 check (publish_min_score between 6 and 10),
  add column if not exists max_publish_per_day smallint not null default 1 check (max_publish_per_day between 0 and 5),
  add column if not exists last_deploy_requested_at timestamptz;

alter table public.growth_seo_drafts
  add column if not exists published_at timestamptz,
  add column if not exists published_by text check (published_by in ('autopilot', 'user')),
  add column if not exists unpublished_at timestamptz,
  add column if not exists unpublished_by uuid,
  add column if not exists publish_block_reason text;

-- One live article per path per company.
create unique index if not exists growth_seo_drafts_live_slug on public.growth_seo_drafts (company_id, slug)
  where published_at is not null and unpublished_at is null;

-- ── owner switch ───────────────────────────────────────────────────────────
create or replace function public.growth_seo_set_auto_publish(_enabled boolean, _min_score smallint default 8, _max_per_day smallint default 1)
returns text language plpgsql security definer set search_path to '' as $$
declare _company uuid := public.get_user_company_id(auth.uid());
        s public.growth_seo_sites;
begin
  if not public.growth_can_approve(auth.uid()) then raise exception 'only owner or company_admin may change auto-publish' using errcode = '42501'; end if;
  select * into s from public.growth_seo_sites where company_id = _company for update;
  if not found then raise exception 'configure the SEO autopilot site first' using errcode = 'P0002'; end if;
  if _min_score is null or _min_score not between 6 and 10 then raise exception 'minimum review score must be 6–10' using errcode = '22023'; end if;
  if _max_per_day is null or _max_per_day not between 0 and 5 then raise exception 'articles per day must be 0–5' using errcode = '22023'; end if;
  update public.growth_seo_sites set auto_publish = coalesce(_enabled, false),
    auto_publish_since = case when coalesce(_enabled, false) and not s.auto_publish then now() when coalesce(_enabled, false) then s.auto_publish_since else null end,
    publish_min_score = _min_score, max_publish_per_day = _max_per_day, updated_by = auth.uid(), updated_at = now()
  where company_id = _company;
  insert into public.growth_audit_log (company_id, actor_type, actor_id, event, detail)
  values (_company, 'user', auth.uid()::text, case when coalesce(_enabled, false) then 'seo_autopilot.auto_publish_on' else 'seo_autopilot.auto_publish_off' end,
          jsonb_build_object('min_score', _min_score, 'max_per_day', _max_per_day));
  return case when coalesce(_enabled, false) then 'on' else 'off' end;
end $$;

-- ── human decision: approving an article now publishes it ──────────────────
create or replace function public.growth_seo_decide_draft(_id uuid, _approve boolean, _note text default null)
returns text language plpgsql security definer set search_path to '' as $$
declare d public.growth_seo_drafts;
        _publish boolean;
begin
  select * into d from public.growth_seo_drafts where id = _id for update;
  if not found or d.company_id is distinct from public.get_user_company_id(auth.uid()) then raise exception 'draft not found' using errcode = 'P0002'; end if;
  if not public.growth_can_approve(auth.uid()) then raise exception 'only owner or company_admin may decide' using errcode = '42501'; end if;
  if d.decision <> 'pending' then raise exception 'draft is already %', d.decision using errcode = '22023'; end if;
  _publish := _approve and d.kind = 'page' and d.slug ~ '^/[a-z0-9\-/]{1,120}$'
    and not exists (select 1 from public.growth_seo_drafts x where x.company_id = d.company_id and x.slug = d.slug and x.published_at is not null and x.unpublished_at is null);
  update public.growth_seo_drafts set decision = case when _approve then 'approved' else 'rejected' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = left(_note, 1000),
    published_at = case when _publish then now() else published_at end,
    published_by = case when _publish then 'user' else published_by end
  where id = _id;
  insert into public.growth_audit_log (company_id, actor_type, actor_id, event, subject_id, detail)
  values (d.company_id, 'user', auth.uid()::text,
          case when _publish then 'seo_draft.published' when _approve then 'seo_draft.approved' else 'seo_draft.rejected' end, _id::text,
          jsonb_build_object('kind', d.kind, 'slug', d.slug, 'title', d.title));
  return case when _publish then 'published' when _approve then 'approved' else 'rejected' end;
end $$;

-- ── take an article off the website ────────────────────────────────────────
create or replace function public.growth_seo_unpublish(_id uuid, _note text default null)
returns text language plpgsql security definer set search_path to '' as $$
declare d public.growth_seo_drafts;
begin
  select * into d from public.growth_seo_drafts where id = _id for update;
  if not found or d.company_id is distinct from public.get_user_company_id(auth.uid()) then raise exception 'draft not found' using errcode = 'P0002'; end if;
  if not public.growth_can_approve(auth.uid()) then raise exception 'only owner or company_admin may unpublish' using errcode = '42501'; end if;
  if d.published_at is null or d.unpublished_at is not null then raise exception 'article is not live' using errcode = '22023'; end if;
  update public.growth_seo_drafts set unpublished_at = now(), unpublished_by = auth.uid(), decision_note = coalesce(left(_note, 1000), decision_note) where id = _id;
  insert into public.growth_audit_log (company_id, actor_type, actor_id, event, subject_id, detail)
  values (d.company_id, 'user', auth.uid()::text, 'seo_draft.unpublished', _id::text, jsonb_build_object('slug', d.slug, 'title', d.title, 'note', left(_note, 300)));
  return 'unpublished';
end $$;

-- ── what the public website shows ──────────────────────────────────────────
-- Only live articles, only their public fields. Callable without login (the
-- marketing site and its build read it with the anon key).
create or replace function public.growth_seo_published_articles(_company uuid)
returns table (path text, title text, meta_description text, h1 text, body text, published_at timestamptz)
language sql stable security definer set search_path to '' as $$
  select d.slug, d.title, d.meta_description, d.h1, d.body, d.published_at
  from public.growth_seo_drafts d
  where d.company_id = _company and d.kind = 'page' and d.slug is not null
    and d.published_at is not null and d.unpublished_at is null
  order by d.published_at desc
  limit 500
$$;

revoke all on function public.growth_seo_set_auto_publish(boolean, smallint, smallint), public.growth_seo_unpublish(uuid, text) from public, anon;
grant execute on function public.growth_seo_set_auto_publish(boolean, smallint, smallint), public.growth_seo_unpublish(uuid, text) to authenticated;
revoke all on function public.growth_seo_decide_draft(uuid, boolean, text) from public, anon;
grant execute on function public.growth_seo_decide_draft(uuid, boolean, text) to authenticated;
revoke all on function public.growth_seo_published_articles(uuid) from public;
grant execute on function public.growth_seo_published_articles(uuid) to anon, authenticated;
