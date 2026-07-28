-- Entry-deadline reminders for favorited events.

-- Opt-in flag (default on) for "Anmälningstiden löper ut" reminders.
alter table public.notification_preferences
  add column if not exists push_on_entry_deadline boolean not null default true;

-- Dedupe table: one row per (person, event, reminder type) once a reminder is sent.
-- reminder_type is 'day_before' (20:00 the evening before) or 'three_hours'
-- (ordinary deadline minus 3 hours).
create table if not exists public.entry_deadline_state (
  id bigint generated always as identity primary key,
  person_id text not null references public.app_users(person_id) on delete cascade,
  event_id text not null,
  reminder_type text not null,
  notified_at timestamptz not null default timezone('utc', now()),
  unique (person_id, event_id, reminder_type)
);

create index if not exists entry_deadline_state_event_idx on public.entry_deadline_state (event_id);
