-- Lets a calendar event be linked to the CRM record it was booked from
-- (a lead, customer, or deal), so "Book meeting" from a Lead/Deal detail
-- panel produces a real, queryable relationship instead of just a
-- title string. Generic (related_type/related_id) rather than three
-- separate FK columns since this needs to point at leads, customers, and
-- deals — customers/leads share the customers table (record_type), deals
-- is separate.
alter table public.calendar_events
  add column related_type text check (related_type in ('lead', 'customer', 'deal')),
  add column related_id uuid;

create index calendar_events_related_idx on public.calendar_events (related_type, related_id) where related_id is not null;
