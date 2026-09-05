-- Live-verified bug (2026-09-05): integration-intelligence's opportunity
-- generator does a read-then-insert check (existingOpenTitles) with no DB
-- constraint behind it. Two concurrent recalculate triggers (fire-and-forget,
-- can overlap) both read an empty set and both inserted the same open
-- opportunity — confirmed via two identical "Prepare a meeting booking when
-- a lead replies" rows created 51ms apart for the same company. The
-- duplicate row has already been removed by hand; this constraint makes the
-- race impossible going forward instead of just less likely.
create unique index if not exists integration_opportunities_one_open_title_per_company
  on public.integration_opportunities (company_id, title)
  where status = 'open';
