-- Purpose-built cache for poll-entry-deadlines so it doesn't refetch the same
-- event's Eventor detail (just to read the entry deadline) on every 30-min
-- cron run. One row per event; `checked_at` drives "revalidate once per
-- Stockholm calendar day, otherwise reuse the cached deadline". `event_date` is
-- the competition's own start date, used to purge the row once the event is over.
create table if not exists public.event_entry_deadline_cache (
  event_id text primary key,
  ordinary_deadline text,
  event_date date,
  checked_at timestamptz not null default now()
);

alter table public.event_entry_deadline_cache enable row level security;
