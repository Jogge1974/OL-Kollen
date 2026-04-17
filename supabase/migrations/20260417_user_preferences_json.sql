-- Add a JSONB column to store full client preferences (calendar filters, favorite classes, etc.)
alter table public.app_users
  add column if not exists preferences_json jsonb;

comment on column public.app_users.preferences_json is 'Full client preferences blob synced from the app (calendar filters, favorite classes, notification settings).';
