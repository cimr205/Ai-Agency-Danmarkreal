-- Video Studio: tenant-scoped media storage + project persistence.
-- Mirrors the campaign-assets bucket pattern (storage.foldername(name)[1] = company_id).

create table if not exists public.video_projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled video',
  project_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  duration_frames integer,
  thumbnail_path text,
  exported_video_path text,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_projects_status_check check (status in ('draft', 'exporting', 'exported', 'failed'))
);

create index if not exists video_projects_company_idx on public.video_projects (company_id, updated_at desc);

create trigger set_video_projects_updated_at
  before update on public.video_projects
  for each row execute function public.update_updated_at_column();

alter table public.video_projects enable row level security;

create policy "Company members read video projects" on public.video_projects
  for select to authenticated using (company_id = public.get_user_company_id(auth.uid()));
create policy "Company members manage video projects" on public.video_projects
  for all to authenticated
  using (company_id = public.get_user_company_id(auth.uid()))
  with check (company_id = public.get_user_company_id(auth.uid()) and created_by = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit)
values ('video-assets', 'video-assets', false, 524288000) -- 500MB per file
on conflict (id) do update set public = false, file_size_limit = 524288000;

create policy "Company members upload video assets" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'video-assets'
    and (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );
create policy "Company members read video assets storage" on storage.objects
  for select to authenticated using (
    bucket_id = 'video-assets'
    and (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );
create policy "Company members delete video assets storage" on storage.objects
  for delete to authenticated using (
    bucket_id = 'video-assets'
    and (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  );
