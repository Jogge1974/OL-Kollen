-- In-app announcements shown to users as a dismissible banner.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  severity text not null default 'info', -- 'info' | 'warning' | 'update'
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  min_version text,
  action_label text,
  action_url text,
  created_at timestamptz not null default now()
);

comment on table public.announcements is 'In-app announcements shown to users as a dismissible banner. Dismissal is tracked per announcement id on the device.';

alter table public.announcements enable row level security;

-- The app uses the publishable/anon key; allow reading active announcements only.
create policy "Anyone can read active announcements"
  on public.announcements
  for select
  using (active = true);

-- Single-row global app configuration (e.g. the latest released app version used
-- to prompt users to update).
create table if not exists public.app_config (
  id boolean primary key default true,
  latest_version text,
  ios_store_url text,
  android_store_url text,
  update_title text,
  update_body text,
  updated_at timestamptz not null default now(),
  constraint app_config_singleton check (id)
);

comment on table public.app_config is 'Global app configuration such as the latest released version for update prompts.';

alter table public.app_config enable row level security;

create policy "Anyone can read app config"
  on public.app_config
  for select
  using (true);

insert into public.app_config (id) values (true) on conflict (id) do nothing;
