-- Calendar redesign: colour, category and attendees on the existing
-- calendar_events table (the redesign's spec described a new table with the
-- same purpose; extending this one keeps existing events, RLS and the
-- dashboard/assistant readers working).
--
-- event_type stays free-form: existing rows use 'meeting', the new UI uses
-- project / appointment / reminder / personal and shows 'meeting' as an
-- appointment. RLS is unchanged (company-scoped, private events, own-row
-- update/delete).

alter table public.calendar_events
  add column if not exists color text not null default 'blue',
  add column if not exists category text,
  add column if not exists attendee_ids uuid[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.calendar_events'::regclass and conname = 'calendar_events_color_check') then
    alter table public.calendar_events add constraint calendar_events_color_check
      check (color = any (array['blue'::text, 'lavender'::text, 'lilac'::text, 'grey'::text, 'mint'::text, 'purple'::text]));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.calendar_events'::regclass and conname = 'calendar_events_category_check') then
    alter table public.calendar_events add constraint calendar_events_category_check
      check (category is null or category = any (array['work'::text, 'personal'::text, 'education'::text]));
  end if;
end $$;
