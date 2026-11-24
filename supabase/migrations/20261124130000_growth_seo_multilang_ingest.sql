-- Growth OS SEO: articles in Danish, English and German, delivered by the local
-- SEO autopilot (owner decision 2026-11-24: run fully autonomously).
--
-- * growth_seo_drafts.lang ('da' | 'en' | 'de'); a path is unique per language,
--   so /crm/ai-crm can be live in Danish and English at the same time.
-- * growth_seo_published_articles() also returns lang, so the site can show each
--   article under /<lang>/guide.
-- * growth_seo_ingest_article(): the local autopilot (~/seo-autopilot) hands in
--   articles its reviewer scored. It authenticates with a per-site token (only
--   its SHA-256 is stored here) and can do exactly one thing: add an article
--   draft for that site. Publishing still goes through the existing, fenced
--   autoPublish pass (score >= publish_min_score, deterministic content checks,
--   max_publish_per_day), and owner/admin can unpublish any article.

alter table public.growth_seo_drafts
  add column if not exists lang text not null default 'da' check (lang in ('da', 'en', 'de'));

drop index if exists public.growth_seo_drafts_live_slug;
create unique index if not exists growth_seo_drafts_live_slug on public.growth_seo_drafts (company_id, lang, slug)
  where published_at is not null and unpublished_at is null;

alter table public.growth_seo_sites
  add column if not exists ingest_token_sha256 text;

-- ── what the public website shows (now with lang) ─────────────────────────
drop function if exists public.growth_seo_published_articles(uuid);
create function public.growth_seo_published_articles(_company uuid)
returns table (path text, title text, meta_description text, h1 text, body text, published_at timestamptz, lang text)
language sql stable security definer set search_path to '' as $$
  select d.slug, d.title, d.meta_description, d.h1, d.body, d.published_at, d.lang
  from public.growth_seo_drafts d
  where d.company_id = _company and d.kind = 'page' and d.slug is not null
    and d.published_at is not null and d.unpublished_at is null
  order by d.published_at desc
  limit 500
$$;
revoke all on function public.growth_seo_published_articles(uuid) from public;
grant execute on function public.growth_seo_published_articles(uuid) to anon, authenticated;

-- ── the local autopilot hands in a reviewed article ───────────────────────
create or replace function public.growth_seo_ingest_article(
  _token text, _lang text, _slug text, _title text, _meta_description text, _h1 text, _body text,
  _review_score smallint, _review_notes text, _worker_model text, _review_model text
) returns uuid
language plpgsql security definer set search_path to '' as $$
declare s public.growth_seo_sites;
        _id uuid;
begin
  if _token is null or length(_token) < 32 then raise exception 'invalid token' using errcode = '28000'; end if;
  select * into s from public.growth_seo_sites
   where enabled and ingest_token_sha256 = encode(extensions.digest(_token, 'sha256'), 'hex');
  if not found then raise exception 'invalid token' using errcode = '28000'; end if;

  if _lang is null or _lang not in ('da', 'en', 'de') then raise exception 'lang must be da, en or de' using errcode = '22023'; end if;
  if _slug is null or _slug !~ '^/[a-z0-9\-/]{1,120}$' or _slug like '%//%' then raise exception 'invalid slug' using errcode = '22023'; end if;
  if coalesce(btrim(_title), '') = '' then raise exception 'title is required' using errcode = '22023'; end if;
  if coalesce(length(_body), 0) not between 1000 and 100000 then raise exception 'body must be 1000-100000 characters' using errcode = '22023'; end if;
  if _review_score is null or _review_score not between 1 and 10 then raise exception 'review score must be 1-10' using errcode = '22023'; end if;

  -- The same article twice (retry after a network error) is not a new draft.
  select id into _id from public.growth_seo_drafts
   where company_id = s.company_id and kind = 'page' and lang = _lang and slug = _slug and decision <> 'rejected'
   limit 1;
  if found then return _id; end if;

  insert into public.growth_seo_drafts (company_id, kind, lang, slug, title, meta_description, h1, body,
                                        worker_model, review_model, review_score, review_notes, review_status, decision)
  values (s.company_id, 'page', _lang, _slug, left(_title, 200), left(_meta_description, 320), left(_h1, 200), _body,
          left(_worker_model, 120), left(_review_model, 120), _review_score, left(_review_notes, 4000), 'passed', 'pending')
  returning id into _id;

  insert into public.growth_audit_log (company_id, actor_type, actor_id, event, subject_id, detail)
  values (s.company_id, 'agent', 'seo-autopilot-local', 'seo_draft.ingested', _id::text,
          jsonb_build_object('slug', _slug, 'lang', _lang, 'title', left(_title, 200), 'review_score', _review_score));
  return _id;
end $$;

revoke all on function public.growth_seo_ingest_article(text, text, text, text, text, text, text, smallint, text, text, text) from public;
grant execute on function public.growth_seo_ingest_article(text, text, text, text, text, text, text, smallint, text, text, text) to anon, authenticated;
