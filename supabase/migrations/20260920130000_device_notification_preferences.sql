-- Notification settings (push_on_start_list / push_on_result_list /
-- push_on_entry_deadline) become device-scoped instead of person-scoped, for
-- the same reason favorites and friends did: with no password login, any
-- device can select ANY personId, so a per-person toggle would make the
-- setting travel with whichever person you pick rather than staying put on
-- the phone. Notification settings apply to the device, not the selected user.
create table if not exists public.device_notification_preferences (
  device_id text primary key,
  push_on_start_list boolean not null default false,
  push_on_result_list boolean not null default false,
  push_on_entry_deadline boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.device_notification_preferences enable row level security;

comment on table public.device_notification_preferences is 'Push-notisinställningar per enhet (device_id), inte per vald person.';
