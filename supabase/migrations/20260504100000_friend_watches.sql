-- Friend watches: server-side copy of the user's friend list so the cron
-- poller can check starts/results and send grouped push notifications.

create table if not exists public.friend_watches (
  id bigint generated always as identity primary key,
  person_id text not null references public.app_users(person_id) on delete cascade,
  friend_person_id text not null,
  friend_name text not null,
  friend_club text,
  friend_gender text,
  friend_birth_year integer,
  push_on_start boolean not null default true,
  push_on_result boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (person_id, friend_person_id)
);

-- State table tracking which notifications have already been sent so we
-- never double-notify.  One row per friend × event combination.

create table if not exists public.friend_activity_state (
  id bigint generated always as identity primary key,
  friend_person_id text not null,
  event_id text not null,
  event_date date,
  start_time timestamptz,
  start_notified_at timestamptz,
  result_notified_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (friend_person_id, event_id)
);

create index if not exists friend_watches_person_id_idx on public.friend_watches(person_id);
create index if not exists friend_watches_friend_person_id_idx on public.friend_watches(friend_person_id);
create index if not exists friend_activity_state_event_date_idx on public.friend_activity_state(event_date);

alter table public.friend_watches enable row level security;
alter table public.friend_activity_state enable row level security;

comment on table public.friend_watches is 'Server-kopia av vänlistan per användare, för push-bevakning.';
comment on table public.friend_activity_state is 'Spårning av skickade notiser per vän och tävling.';
